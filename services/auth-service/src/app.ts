import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { generateId, StructuredLogger, ValidationError, AuthenticationError, AppError } from '@automation-os/shared-utils';
import { DatabaseService } from './database.js';
import { UserRepository, WorkspaceRepository } from './repositories.js';
import { validatePasswordPolicy, hashPassword, verifyPassword, generateToken, verifyToken } from './auth-utils.js';
import { User, Workspace, WorkspaceMembership } from '@automation-os/shared-types';

const logger = new StructuredLogger('AuthServiceApp');

// Extend Express Request interface to carry context type-safely
export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: {
    userId: string;
    email: string;
    workspaces: string[];
  };
}

export function createApp(db: DatabaseService): express.Application {
  const app = express();
  app.use(express.json());

  const userRepo = new UserRepository(db);
  const workspaceRepo = new WorkspaceRepository(db);

  // 1. Request ID and Logging Middleware
  app.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const rId = (req.headers['x-request-id'] as string) || generateId('req');
    req.requestId = rId;
    res.setHeader('x-request-id', rId);

    logger.info(`Incoming request: ${req.method} ${req.url}`, {
      requestId: rId,
      method: req.method || '',
      url: req.url || '',
    });

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`Request completed: ${req.method} ${req.url} -> ${res.statusCode}`, {
        requestId: rId,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  });

  // 2. JWT Verification Middleware
  const requireAuth: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AuthenticationError('Missing or malformed Authorization header'));
    }

    const token = authHeader.substring(7);
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
      next();
    } catch (err) {
      next(err);
    }
  };

  // --- PUBLIC ROUTES ---

  // Health and Readiness endpoints
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', service: 'auth-service' });
  });

  // Register Endpoint
  app.post('/api/auth/register', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        throw new ValidationError('Email, password, and name are required');
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Enforce Password Policy
      if (!validatePasswordPolicy(password)) {
        throw new ValidationError(
          'Password does not meet complexity rules. It must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters.',
        );
      }

      // Check Duplicate User
      const existingUser = await userRepo.findByEmail(normalizedEmail);
      if (existingUser) {
        res.status(409).json({
          error: 'CONFLICT_ERROR',
          message: 'A user with this email address already exists',
        });
        return;
      }

      // Create User
      const userId = generateId('usr');
      const passwordHash = hashPassword(password);
      const now = new Date();

      const user: User = {
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
      };

      await userRepo.create(user);

      // Create Default Workspace
      const workspaceId = generateId('wsp');
      const workspace: Workspace = {
        id: workspaceId,
        name: `${user.name}'s Workspace`,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceRepo.create(workspace);

      // Create Membership
      const membership: WorkspaceMembership = {
        workspaceId,
        userId,
        role: 'owner',
        createdAt: now,
      };

      await workspaceRepo.createMembership(membership);

      // Generate Access Token
      const token = generateToken({
        userId,
        email: normalizedEmail,
        workspaces: [workspaceId],
      });

      res.status(201).json({
        user: {
          id: userId,
          email: normalizedEmail,
          name: user.name,
          createdAt: user.createdAt,
        },
        workspace: {
          id: workspaceId,
          name: workspace.name,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Login Endpoint
  app.post('/api/auth/login', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = await userRepo.findByEmail(normalizedEmail);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Fetch user workspace memberships
      const workspaces = await workspaceRepo.listByUserId(user.id);
      const workspaceIds = workspaces.map((w) => w.id);

      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        workspaces: workspaceIds,
      });

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // --- PROTECTED ROUTES ---

  // Get Profile Endpoint
  app.get('/api/auth/me', requireAuth, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const context = req.user!;
      const user = await userRepo.findById(context.userId);

      if (!user) {
        throw new AuthenticationError('User profile not found');
      }

      const workspaces = await workspaceRepo.listByUserId(user.id);

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          ownerId: w.ownerId,
        })),
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // Create Workspace Endpoint
  app.post('/api/auth/workspaces', requireAuth, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const context = req.user!;
      const { name } = req.body;

      if (!name || name.trim().length === 0) {
        throw new ValidationError('Workspace name is required');
      }

      const now = new Date();
      const workspaceId = generateId('wsp');
      const workspace: Workspace = {
        id: workspaceId,
        name: name.trim(),
        ownerId: context.userId,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceRepo.create(workspace);

      // Register owner membership
      const membership: WorkspaceMembership = {
        workspaceId,
        userId: context.userId,
        role: 'owner',
        createdAt: now,
      };

      await workspaceRepo.createMembership(membership);

      res.status(201).json(workspace);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // List Workspaces Endpoint
  app.get('/api/auth/workspaces', requireAuth, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const context = req.user!;
      const workspaces = await workspaceRepo.listByUserId(context.userId);
      res.status(200).json(workspaces);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  // 3. Error Handling Middleware
  app.use((err: Error, req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    logger.error(`Error processing request ${req.method} ${req.url}`, err, {
      requestId: req.requestId || 'unknown',
    });

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
        details: (err as ValidationError).details,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
    });
  });

  return app;
}
