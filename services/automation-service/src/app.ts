import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { generateId, StructuredLogger, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, AppError } from '@automation-os/shared-utils';
import { DatabaseService } from './database.js';
import { WorkflowRepository, WorkflowVersionRepository } from './repositories.js';
import { Workflow, WorkflowVersion, WorkflowStep } from '@automation-os/shared-types';

const logger = new StructuredLogger('AutomationServiceApp');

// Setup request context shape
export interface AutomationRequest extends Request {
  requestId?: string;
  userContext?: {
    userId: string;
    email: string;
    workspaces: string[];
  };
}

export function createApp(db: DatabaseService): express.Application {
  const app = express();
  app.use(express.json());

  const workflowRepo = new WorkflowRepository(db);
  const versionRepo = new WorkflowVersionRepository(db);

  // 1. Context parsing & Logging Middleware
  app.use((req: AutomationRequest, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) || generateId('req');

    const userCtxHeader = req.headers['x-user-context'];
    if (userCtxHeader) {
      try {
        req.userContext = JSON.parse(userCtxHeader as string);
      } catch (_err) {
        // Ignored
      }
    }

    logger.info(`Automation request: ${req.method} ${req.url}`, {
      requestId: req.requestId,
      userId: req.userContext?.userId || 'anonymous',
    });

    next();
  });

  // Helper middleware: Ensure authenticated user context exists
  const requireUser = (req: AutomationRequest, _res: Response, next: NextFunction) => {
    if (!req.userContext || !req.userContext.userId) {
      return next(new AuthenticationError('User context is missing. Request must pass through API Gateway.'));
    }
    next();
  };

  // Helper function to validate workspace access
  const checkWorkspaceAccess = (req: AutomationRequest, workspaceId: string) => {
    if (!req.userContext?.workspaces.includes(workspaceId)) {
      throw new AuthorizationError('You do not have access to this workspace');
    }
  };

  // HEALTH CHECK
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', service: 'automation-service' });
  });

  // --- WORKFLOW CRUD ---

  // Create Workflow
  app.post('/api/workflows', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { workspaceId, name, description, targetApplicationId, environment, tags, steps } = req.body;

      if (!workspaceId || !name || !targetApplicationId || !environment) {
        throw new ValidationError('WorkspaceId, name, targetApplicationId, and environment are required');
      }

      checkWorkspaceAccess(req, workspaceId);

      const workflowId = generateId('wfl');
      const now = new Date();

      const workflow: Workflow = {
        id: workflowId,
        workspaceId,
        name: name.trim(),
        description: (description || '').trim(),
        status: 'draft',
        ownerId: req.userContext!.userId,
        targetApplicationId,
        environment,
        tags: Array.isArray(tags) ? tags : [],
        createdAt: now,
        updatedAt: now,
      };

      await workflowRepo.create(workflow);

      // Automatically provision Version 1 (draft) with optional steps
      const versionId = generateId('ver');
      const versionSteps: WorkflowStep[] = [];

      if (Array.isArray(steps)) {
        steps.forEach((s: any, idx: number) => {
          versionSteps.push({
            id: s.id || generateId('stp'),
            workflowVersionId: versionId,
            order: idx + 1,
            action: s.action,
            target: s.target || '',
            adapterPreference: s.adapterPreference,
            timeoutMs: s.timeoutMs || 5000,
            retries: s.retries ?? 3,
            preconditions: Array.isArray(s.preconditions) ? s.preconditions : [],
            failurePolicy: s.failurePolicy || 'retry',
            parameters: s.parameters || {},
          });
        });
      }

      const version: WorkflowVersion = {
        id: versionId,
        workflowId,
        versionNumber: 1,
        steps: versionSteps,
        status: 'draft',
        createdById: req.userContext!.userId,
        createdAt: now,
      };

      await versionRepo.create(version);

      res.status(201).json({
        workflow,
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          steps: version.steps,
          status: version.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // List Workflows
  app.get('/api/workflows', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      if (!workspaceId) {
        throw new ValidationError('workspaceId query parameter is required');
      }

      checkWorkspaceAccess(req, workspaceId);

      const workflows = await workflowRepo.listByWorkspace(workspaceId);
      res.status(200).json(workflows);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Get Workflow details (including latest version)
  app.get('/api/workflows/:id', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const workflow = await workflowRepo.findById(id);

      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const latestVersion = await versionRepo.getLatestByWorkflowId(id);

      res.status(200).json({
        ...workflow,
        latestVersion,
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Update Workflow
  app.put('/api/workflows/:id', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, targetApplicationId, environment, tags } = req.body;

      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const updatedWorkflow: Workflow = {
        ...workflow,
        name: name ? name.trim() : workflow.name,
        description: description !== undefined ? description.trim() : workflow.description,
        targetApplicationId: targetApplicationId || workflow.targetApplicationId,
        environment: environment || workflow.environment,
        tags: Array.isArray(tags) ? tags : workflow.tags,
        updatedAt: new Date(),
      };

      await workflowRepo.update(updatedWorkflow);
      res.status(200).json(updatedWorkflow);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Delete Workflow
  app.delete('/api/workflows/:id', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      await workflowRepo.delete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // --- VERSIONING ENDPOINTS ---

  // Create New Version
  app.post('/api/workflows/:id/versions', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { steps } = req.body;

      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const latestVersion = await versionRepo.getLatestByWorkflowId(id);
      const newVersionNum = latestVersion ? latestVersion.versionNumber + 1 : 1;

      const versionId = generateId('ver');
      const versionSteps: WorkflowStep[] = [];

      if (Array.isArray(steps)) {
        steps.forEach((s: any, idx: number) => {
          versionSteps.push({
            id: s.id || generateId('stp'),
            workflowVersionId: versionId,
            order: idx + 1,
            action: s.action,
            target: s.target || '',
            adapterPreference: s.adapterPreference,
            timeoutMs: s.timeoutMs || 5000,
            retries: s.retries ?? 3,
            preconditions: Array.isArray(s.preconditions) ? s.preconditions : [],
            failurePolicy: s.failurePolicy || 'retry',
            parameters: s.parameters || {},
          });
        });
      }

      const version: WorkflowVersion = {
        id: versionId,
        workflowId: id,
        versionNumber: newVersionNum,
        steps: versionSteps,
        status: 'draft',
        createdById: req.userContext!.userId,
        createdAt: new Date(),
      };

      await versionRepo.create(version);
      res.status(201).json(version);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // List Versions
  app.get('/api/workflows/:id/versions', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const versions = await versionRepo.listByWorkflowId(id);
      res.status(200).json(versions);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Get specific version details
  app.get('/api/workflows/:id/versions/:vId', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id, vId } = req.params;
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const version = await versionRepo.findById(vId);
      if (!version || version.workflowId !== id) {
        throw new NotFoundError('Version not found');
      }

      res.status(200).json(version);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Publish Version
  app.post('/api/workflows/:id/versions/:vId/publish', requireUser, (async (req: AutomationRequest, res: Response, next: NextFunction) => {
    try {
      const { id, vId } = req.params;
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      checkWorkspaceAccess(req, workflow.workspaceId);

      const version = await versionRepo.findById(vId);
      if (!version || version.workflowId !== id) {
        throw new NotFoundError('Version not found');
      }

      // Mark other versions of this workflow as draft or archived if needed,
      // and set this version to published.
      // For simplicity, we just mark this version as published and update workflow status to published.
      db.run("UPDATE workflow_versions SET status = 'draft' WHERE workflow_id = ?", [id]);
      db.run("UPDATE workflow_versions SET status = 'published' WHERE id = ?", [vId]);

      const updatedWorkflow: Workflow = {
        ...workflow,
        status: 'published',
        updatedAt: new Date(),
      };
      await workflowRepo.update(updatedWorkflow);

      const updatedVersion = await versionRepo.findById(vId);
      res.status(200).json({
        workflow: updatedWorkflow,
        version: updatedVersion,
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // 3. Global Error Handling
  app.use((err: Error, req: AutomationRequest, res: Response, _next: NextFunction) => {
    logger.error(`Error processing automation request ${req.method} ${req.url}`, err, {
      requestId: req.requestId || 'unknown',
    });

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred in the automation service.',
    });
  });

  return app;
}
