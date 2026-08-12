import { User, Workspace, Workflow, WorkflowStep, Execution, ExecutionStep, AuditEvent } from '@automation-os/shared-types';

/**
 * Generator for Mock User data
 */
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: overrides?.id || 'usr_test_123',
    email: overrides?.email || 'test@automation-os.local',
    passwordHash: overrides?.passwordHash || '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    name: overrides?.name || 'Test User',
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * Generator for Mock Workspace data
 */
export function createMockWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    id: overrides?.id || 'wsp_test_123',
    name: overrides?.name || 'Test Workspace',
    ownerId: overrides?.ownerId || 'usr_test_123',
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * Generator for Mock Workflow data
 */
export function createMockWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: overrides?.id || 'wfl_test_123',
    workspaceId: overrides?.workspaceId || 'wsp_test_123',
    name: overrides?.name || 'Test Workflow',
    description: overrides?.description || 'Automated test pipeline description',
    status: overrides?.status || 'draft',
    ownerId: overrides?.ownerId || 'usr_test_123',
    targetApplicationId: overrides?.targetApplicationId || 'app_chrome',
    environment: overrides?.environment || 'staging',
    tags: overrides?.tags || ['test', 'ci'],
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * Generator for Mock WorkflowStep data
 */
export function createMockWorkflowStep(overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: overrides?.id || 'stp_test_123',
    workflowVersionId: overrides?.workflowVersionId || 'ver_test_123',
    order: overrides?.order ?? 1,
    action: overrides?.action || 'click',
    target: overrides?.target || '#btn-submit',
    adapterPreference: overrides?.adapterPreference || 'mock',
    timeoutMs: overrides?.timeoutMs || 5000,
    retries: overrides?.retries ?? 3,
    preconditions: overrides?.preconditions || [],
    verification: overrides?.verification || {
      type: 'dom_state',
      target: '#success-indicator',
    },
    failurePolicy: overrides?.failurePolicy || 'retry',
    parameters: overrides?.parameters || {},
  };
}

/**
 * Generator for Mock Execution data
 */
export function createMockExecution(overrides?: Partial<Execution>): Execution {
  return {
    id: overrides?.id || 'exe_test_123',
    workspaceId: overrides?.workspaceId || 'wsp_test_123',
    workflowId: overrides?.workflowId || 'wfl_test_123',
    workflowVersionId: overrides?.workflowVersionId || 'ver_test_123',
    jobId: overrides?.jobId || 'job_test_123',
    idempotencyKey: overrides?.idempotencyKey || 'idem_key_123',
    status: overrides?.status || 'queued',
    startedAt: overrides?.startedAt,
    completedAt: overrides?.completedAt,
    error: overrides?.error,
    triggeredBy: overrides?.triggeredBy || 'usr_test_123',
  };
}

/**
 * Generator for Mock ExecutionStep data
 */
export function createMockExecutionStep(overrides?: Partial<ExecutionStep>): ExecutionStep {
  return {
    id: overrides?.id || 'exs_test_123',
    executionId: overrides?.executionId || 'exe_test_123',
    stepId: overrides?.stepId || 'stp_test_123',
    status: overrides?.status || 'pending',
    attempt: overrides?.attempt ?? 1,
    startedAt: overrides?.startedAt,
    completedAt: overrides?.completedAt,
    error: overrides?.error,
    logs: overrides?.logs || [],
  };
}

/**
 * Generator for Mock AuditEvent data
 */
export function createMockAuditEvent(overrides?: Partial<AuditEvent>): AuditEvent {
  return {
    id: overrides?.id || 'aud_test_123',
    workspaceId: overrides?.workspaceId || 'wsp_test_123',
    userId: overrides?.userId || 'usr_test_123',
    action: overrides?.action || 'WorkflowCreated',
    entityId: overrides?.entityId || 'wfl_test_123',
    entityType: overrides?.entityType || 'workflow',
    metadata: overrides?.metadata || {},
    timestamp: overrides?.timestamp || new Date(),
  };
}

/**
 * Simple test stethoscope / spy tool to record functional callback parameters
 */
export class TestStethoscope<T> {
  public calls: T[] = [];

  public record(payload: T): void {
    this.calls.push(payload);
  }

  public reset(): void {
    this.calls = [];
  }
}
