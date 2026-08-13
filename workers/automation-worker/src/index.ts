import { Queue, Worker, Job } from 'bullmq';
import { config } from '@automation-os/config';
import { Execution, WorkflowVersion, WorkflowStep, ExecutionStep, Evidence } from '@automation-os/shared-types';
import { generateId, StructuredLogger } from '@automation-os/shared-utils';
import { WorkflowExecutorPipeline, IAutomationAdapter, IVerificationEngine, IPolicyEngine, ExecutionState } from '@automation-os/workflow-engine';

const logger = new StructuredLogger('AutomationWorker');

export interface JobPayload {
  executionId: string;
  workflowId: string;
  workflowVersionId: string;
  idempotencyKey?: string;
  triggeredBy: string;
}

/**
 * Mock Verification Engine implementation
 */
export class SimpleVerificationEngine implements IVerificationEngine {
  public async verify(
    step: WorkflowStep,
    _evidence?: Evidence,
  ): Promise<{ passed: boolean; logs: string[]; error?: string }> {
    logger.info(`Verification Engine evaluating step: ${step.id}`);

    // For now, always pass if verification spec type is matched
    return {
      passed: true,
      logs: [`[VERIFIER] Successfully verified state: ${step.verification?.type || 'default_action'}`],
    };
  }
}

/**
 * Mock Policy Engine implementation
 */
export class SimplePolicyEngine implements IPolicyEngine {
  public async validateStep(
    step: WorkflowStep,
    context: { workspaceId: string },
  ): Promise<{ allowed: boolean; reason?: string }> {
    logger.info(`Policy Engine checking step: ${step.id} in workspace: ${context.workspaceId}`);

    // Check if target is in banned list
    if (step.target.includes('malicious-site.com') || step.target.includes('/etc/shadow')) {
      return {
        allowed: false,
        reason: 'Target violates restricted directory or domain allowlist policies.',
      };
    }

    return {
      allowed: true,
    };
  }
}

/**
 * Mock Automation Adapter implementation (Simulates real execution results)
 */
export class SimpleMockAdapter implements IAutomationAdapter {
  public readonly id = 'mock';
  public readonly capabilities = ['browser', 'windows_ui', 'visual', 'ocr'];

  public async executeStep(
    step: WorkflowStep,
    context: { executionId: string; attempt: number },
  ): Promise<{ success: boolean; logs: string[]; evidence?: Evidence; error?: string }> {
    logger.info(`Mock Adapter executing step action: ${step.action}`);

    const simAction = step.parameters.mockSimulation as string || 'MockSuccess';

    if (simAction === 'MockFailure') {
      return {
        success: false,
        logs: [`[MOCK] Attempt ${context.attempt} - Failed to locate element: ${step.target}`],
        error: `Element not found: ${step.target}`,
      };
    }

    if (simAction === 'MockTimeout') {
      const waitTime = Number(step.parameters.waitTimeMs || 1000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return {
        success: false,
        logs: [`[MOCK] Action timed out after ${waitTime}ms`],
        error: `Timeout executing action: ${step.action}`,
      };
    }

    // Default: MockSuccess
    const evidenceId = generateId('evd');
    const evidence: Evidence = {
      id: evidenceId,
      executionId: context.executionId,
      stepId: step.id,
      type: 'screenshot',
      value: `Screenshot metadata captured for step: ${step.id}`,
      createdAt: new Date(),
    };

    return {
      success: true,
      logs: [`[MOCK] Successfully completed action: ${step.action} on target: ${step.target}`],
      evidence,
    };
  }
}

/**
 * Core Worker Orchestrator
 */
export class AutomationWorker {
  private worker: Worker | null = null;
  private queue: Queue | null = null;

  // Track simple in-memory database of executions for standalone testing/fallback
  private executionsDb = new Map<string, Execution>();
  private executionStepsDb = new Map<string, ExecutionStep[]>();
  private evidenceDb = new Map<string, Evidence[]>();

  constructor(
    private redisOptions = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
    },
  ) {}

  /**
   * Starts the BullMQ worker loop (falls back to memory processing if Redis is unavailable)
   */
  public async start(): Promise<void> {
    const queueName = 'automation-jobs';

    logger.info(`Starting Automation Worker connecting to Redis at ${this.redisOptions.host}:${this.redisOptions.port}...`);

    try {
      this.queue = new Queue(queueName, {
        connection: this.redisOptions,
      });

      this.worker = new Worker(
        queueName,
        async (job: Job<JobPayload>) => {
          await this.processJob(job.data);
        },
        {
          connection: this.redisOptions,
          concurrency: 5, // Limit concurrent workflow steps
        },
      );

      this.worker.on('failed', (job, err) => {
        logger.error(`Job ${job?.id} failed in BullMQ:`, err);
      });

      logger.info('BullMQ worker is listening successfully.');
    } catch (err: unknown) {
      logger.warn(`Redis is offline or unavailable. Worker will leverage fallback sequential in-memory queue.`, {
        error: (err as Error).message,
      });
      this.queue = null;
      this.worker = null;
    }
  }

  /**
   * Helper to register execution parameters for memory-fallback mock environments
   */
  public registerMockExecution(execution: Execution, _steps: WorkflowStep[]): void {
    this.executionsDb.set(execution.id, { ...execution });
    this.executionStepsDb.set(execution.id, []);
  }

  /**
   * Enqueues or immediately schedules a job
   */
  public async submitJob(payload: JobPayload, stepsFallback?: WorkflowStep[]): Promise<void> {
    if (this.queue) {
      await this.queue.add(`job_${payload.executionId}`, payload, {
        attempts: 1,
        removeOnComplete: true,
      });
      logger.info(`Enqueued job into BullMQ for execution: ${payload.executionId}`);
    } else {
      logger.info(`Processing job immediately via sequential in-memory fallback for: ${payload.executionId}`);

      // Simulate asynchronous execution loop on-the-fly
      setImmediate(async () => {
        try {
          await this.processJob(payload, stepsFallback);
        } catch (err: unknown) {
          logger.error(`Memory job execution failed`, err as Error);
        }
      });
    }
  }

  /**
   * Core Step Loop Processor
   */
  public async processJob(payload: JobPayload, stepsFallback?: WorkflowStep[]): Promise<void> {
    logger.info(`Processing Job for Execution ID: ${payload.executionId}`);

    // Resolve details (from local memory DB in tests, or from services in prod)
    const execution = this.executionsDb.get(payload.executionId) || {
      id: payload.executionId,
      workspaceId: 'wsp_fallback_id',
      workflowId: payload.workflowId,
      workflowVersionId: payload.workflowVersionId,
      status: 'queued' as const,
      triggeredBy: payload.triggeredBy,
    };

    const version: WorkflowVersion = {
      id: payload.workflowVersionId,
      workflowId: payload.workflowId,
      versionNumber: 1,
      steps: stepsFallback || [],
      status: 'published',
      createdById: payload.triggeredBy,
      createdAt: new Date(),
    };

    const mockAdapter = new SimpleMockAdapter();
    const verifier = new SimpleVerificationEngine();
    const policyEngine = new SimplePolicyEngine();

    const pipeline = new WorkflowExecutorPipeline(execution, version, {
      adapter: mockAdapter,
      verifier,
      policyEngine,
      onStateTransition: async (state: ExecutionState, error?: string) => {
        execution.status = state;
        if (error) execution.error = error;
        if (state === 'running' && !execution.startedAt) execution.startedAt = new Date();
        if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(state)) {
          execution.completedAt = new Date();
        }
        this.executionsDb.set(execution.id, execution);
        logger.info(`Execution FSM transitioned: ${execution.id} -> ${state}`, { error: error ?? '' });
      },
      onStepProgress: async (stepProgress: ExecutionStep) => {
        const steps = this.executionStepsDb.get(execution.id) || [];
        // Replace or add
        const existingIdx = steps.findIndex(s => s.stepId === stepProgress.stepId);
        if (existingIdx !== -1) {
          steps[existingIdx] = stepProgress;
        } else {
          steps.push(stepProgress);
        }
        this.executionStepsDb.set(execution.id, steps);
        logger.info(`ExecutionStep progress: ${stepProgress.stepId} -> ${stepProgress.status}`);
      },
      onEvidenceRecorded: async (evidence: Evidence) => {
        const evidenceList = this.evidenceDb.get(execution.id) || [];
        evidenceList.push(evidence);
        this.evidenceDb.set(execution.id, evidenceList);
        logger.info(`Evidence recorded: ${evidence.id}`);
      },
    });

    await pipeline.execute();
  }

  public getExecutionState(id: string): Execution | undefined {
    return this.executionsDb.get(id);
  }

  public getExecutionSteps(id: string): ExecutionStep[] {
    return this.executionStepsDb.get(id) || [];
  }

  public getEvidence(id: string): Evidence[] {
    return this.evidenceDb.get(id) || [];
  }

  /**
   * Safely stops the worker sessions
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}
export default AutomationWorker;
