import { Execution, WorkflowVersion, WorkflowStep, ExecutionStep, Evidence } from '@automation-os/shared-types';
import { generateId, StructuredLogger, ExecutionError, ValidationError } from '@automation-os/shared-utils';

const logger = new StructuredLogger('WorkflowEngine');

export type ExecutionState = Execution['status'];

/**
 * Permitted State Machine Transition Edges
 */
const VALID_TRANSITIONS: Record<ExecutionState, Set<ExecutionState>> = {
  draft: new Set(['validated']),
  validated: new Set(['queued', 'failed']),
  queued: new Set(['planning', 'failed', 'cancelled']),
  planning: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['verifying', 'failed', 'cancelled', 'timed_out', 'manual_intervention', 'recovering', 'succeeded']),
  waiting: new Set(['running', 'failed', 'cancelled']),
  verifying: new Set(['running', 'recovering', 'succeeded', 'failed', 'manual_intervention']),
  recovering: new Set(['running', 'failed', 'manual_intervention', 'succeeded']),
  manual_intervention: new Set(['running', 'succeeded', 'failed', 'cancelled']),
  succeeded: new Set<ExecutionState>(), // Final state
  failed: new Set<ExecutionState>(),    // Final state
  cancelled: new Set<ExecutionState>(), // Final state
  timed_out: new Set<ExecutionState>(), // Final state
};

/**
 * State Machine Manager validating FSM transitions
 */
export class ExecutionStateMachine {
  public static validateTransition(from: ExecutionState, to: ExecutionState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }
}

/**
 * Interface for adapters called by the execution pipeline
 */
export interface IAutomationAdapter {
  id: string;
  capabilities: string[];
  executeStep(
    step: WorkflowStep,
    context: { executionId: string; attempt: number },
  ): Promise<{ success: boolean; logs: string[]; evidence?: Evidence; error?: string }>;
}

/**
 * Interface for verification engine called after step completion
 */
export interface IVerificationEngine {
  verify(
    step: WorkflowStep,
    evidence?: Evidence,
  ): Promise<{ passed: boolean; logs: string[]; error?: string }>;
}

/**
 * Interface for policy engine called before step execution
 */
export interface IPolicyEngine {
  validateStep(
    step: WorkflowStep,
    context: { workspaceId: string },
  ): Promise<{ allowed: boolean; reason?: string }>;
}

export interface PipelineExecutionOptions {
  adapter: IAutomationAdapter;
  verifier: IVerificationEngine;
  policyEngine: IPolicyEngine;
  onStateTransition: (state: ExecutionState, error?: string) => Promise<void>;
  onStepProgress: (step: ExecutionStep) => Promise<void>;
  onEvidenceRecorded: (evidence: Evidence) => Promise<void>;
}

/**
 * The Deterministic Step Execution Pipeline
 */
export class WorkflowExecutorPipeline {
  private currentState: ExecutionState = 'queued';

  constructor(
    private execution: Execution,
    private version: WorkflowVersion,
    private options: PipelineExecutionOptions,
  ) {
    this.currentState = execution.status;
  }

  /**
   * Transitions state machine status safely
   */
  private async transitionTo(nextState: ExecutionState, error?: string): Promise<void> {
    if (this.currentState === nextState) return;

    if (!ExecutionStateMachine.validateTransition(this.currentState, nextState)) {
      throw new ExecutionError(`Invalid execution state transition from ${this.currentState} to ${nextState}`);
    }

    logger.info(`Transitioning execution ${this.execution.id} from ${this.currentState} -> ${nextState}`);
    this.currentState = nextState;
    await this.options.onStateTransition(nextState, error);
  }

  /**
   * Runs the workflow version pipeline to completion deterministically
   */
  public async execute(): Promise<void> {
    try {
      await this.transitionTo('planning');

      // 1. Validate version and steps
      if (this.version.steps.length === 0) {
        throw new ValidationError('Workflow has no executable steps.');
      }

      // Sort steps sequentially
      const sortedSteps = [...this.version.steps].sort((a, b) => a.order - b.order);

      await this.transitionTo('running');

      for (const step of sortedSteps) {
        let attempt = 1;
        let stepPassed = false;
        let currentError = '';

        while (attempt <= (step.retries || 1) && !stepPassed) {
          logger.info(`Executing step ${step.id} (Action: ${step.action}), attempt ${attempt}/${step.retries}`);

          const executionStep: ExecutionStep = {
            id: generateId('exs'),
            executionId: this.execution.id,
            stepId: step.id,
            status: 'running',
            attempt,
            startedAt: new Date(),
            logs: [],
          };

          await this.options.onStepProgress(executionStep);

          // A. Policy Engine Validation before action
          const policyCheck = await this.options.policyEngine.validateStep(step, {
            workspaceId: this.execution.workspaceId,
          });

          if (!policyCheck.allowed) {
            executionStep.status = 'failed';
            executionStep.error = `Policy Violation: ${policyCheck.reason || 'Operation denied'}`;
            executionStep.logs.push(`[POLICY DENIED] ${policyCheck.reason}`);
            executionStep.completedAt = new Date();
            await this.options.onStepProgress(executionStep);

            if (step.failurePolicy === 'fail') {
              throw new ExecutionError(`Step ${step.id} execution aborted due to security policies.`);
            } else {
              logger.warn(`Step ${step.id} policy failed, but failurePolicy is ignore/recover. Skipping...`);
              break;
            }
          }

          // B. Execute Action via Adapter
          try {
            const actionResult = await this.options.adapter.executeStep(step, {
              executionId: this.execution.id,
              attempt,
            });

            executionStep.logs.push(...actionResult.logs);

            if (actionResult.success) {
              await this.transitionTo('verifying');

              // C. Post-step Verification Checks
              const verificationResult = await this.options.verifier.verify(step, actionResult.evidence);
              executionStep.logs.push(...verificationResult.logs);

              if (verificationResult.passed) {
                stepPassed = true;
                executionStep.status = 'succeeded';

                if (actionResult.evidence) {
                  await this.options.onEvidenceRecorded(actionResult.evidence);
                }
              } else {
                currentError = verificationResult.error || 'Verification Assertions Failed';
                executionStep.status = 'failed';
                executionStep.error = currentError;

                await this.transitionTo('recovering');
              }
            } else {
              currentError = actionResult.error || 'Adapter Execution Failed';
              executionStep.status = 'failed';
              executionStep.error = currentError;

              await this.transitionTo('recovering');
            }
          } catch (err: unknown) {
            const errorMsg = (err as Error).message;
            currentError = errorMsg;
            executionStep.status = 'failed';
            executionStep.error = errorMsg;
            executionStep.logs.push(`[ADAPTER EXCEPTION] ${errorMsg}`);

            await this.transitionTo('recovering');
          }

          executionStep.completedAt = new Date();
          await this.options.onStepProgress(executionStep);

          if (!stepPassed) {
            attempt++;
          } else {
            await this.transitionTo('running');
          }
        }

        // Handle step-level failure policy exhaustions
        if (!stepPassed) {
          if (step.failurePolicy === 'fail') {
            throw new ExecutionError(`Workflow execution failed on step ${step.id}: ${currentError}`);
          } else if (step.failurePolicy === 'recover') {
            await this.transitionTo('manual_intervention', currentError);
            return; // Pipeline pauses for manual resolution
          } else {
            logger.warn(`Step ${step.id} failed, ignoring according to failurePolicy.`);
          }
        }
      }

      await this.transitionTo('succeeded');
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      await this.transitionTo('failed', errorMsg);
    }
  }
}
