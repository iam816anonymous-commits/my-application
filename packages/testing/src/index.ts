import { User, Workspace, Workflow, WorkflowStep, Execution, ExecutionStep, AuditEvent, Evidence } from '@automation-os/shared-types';

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

/**
 * Full implementation of standalone MockAutomationAdapter (Phase 7)
 * Capable of simulating: find, click, type, wait, screenshot, readText, upload, download, success, failure, timeout, low-confidence match
 */
export class MockAutomationAdapter {
  public readonly id = 'mock';
  public readonly capabilities = ['browser', 'windows_ui', 'visual', 'ocr'];

  public async executeStep(
    step: WorkflowStep,
    context: { executionId: string; attempt: number },
  ): Promise<{ success: boolean; logs: string[]; evidence?: Evidence; error?: string }> {
    const logs: string[] = [`[MOCK ADAPTER] Initializing simulated step: ${step.id} (Action: ${step.action})`];
    const trigger = step.parameters.mockSimulation as string || 'MockSuccess';

    loggerInfo(`Handling mock action: '${step.action}' with parameter: '${trigger}' on target: '${step.target}'`, logs);

    // 1. Simulate general Failure
    if (trigger === 'MockFailure') {
      logs.push(`[MOCK ADAPTER] Simulated Failure triggered.`);
      return {
        success: false,
        logs,
        error: `Simulated execution failure on step ${step.id}: element ${step.target} not found.`,
      };
    }

    // 2. Simulate Timeout
    if (trigger === 'MockTimeout') {
      const waitTime = Number(step.parameters.waitTimeMs || 1000);
      logs.push(`[MOCK ADAPTER] Simulated Timeout triggered. Sleeping for ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return {
        success: false,
        logs,
        error: `Simulated timeout error: action exceeded threshold ${step.timeoutMs}ms.`,
      };
    }

    // 3. Simulate Low-Confidence Match
    if (trigger === 'MockLowConfidence') {
      logs.push(`[MOCK ADAPTER] Simulated Low-Confidence visual match detected.`);
      const evidence: Evidence = {
        id: generateId('evd'),
        executionId: context.executionId,
        stepId: step.id,
        type: 'screenshot',
        value: '0.82', // Similarity score of 0.82 (below 0.90 limit)
        createdAt: new Date(),
      };
      return {
        success: true, // Action was run but visual check returns low similarity
        logs,
        evidence,
      };
    }

    // Otherwise, handle all actions successfully:
    let evidenceValue = 'Success';

    switch (step.action) {
      case 'find':
        logs.push(`[MOCK ADAPTER] Simulated locating target element: '${step.target}' -> Found successfully.`);
        break;

      case 'click':
      case 'doubleClick':
        logs.push(`[MOCK ADAPTER] Simulated mouse input click dispatched at coordinates matching target element.`);
        break;

      case 'type':
        const textToType = step.parameters.text as string || 'default-input-text';
        logs.push(`[MOCK ADAPTER] Simulated typing text: '${textToType}' into input matching: '${step.target}'`);
        break;

      case 'wait':
        const delay = Number(step.parameters.delayMs || 500);
        logs.push(`[MOCK ADAPTER] Simulating sleep delay: ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        break;

      case 'screenshot':
        logs.push(`[MOCK ADAPTER] Successfully captured simulated canvas frame screenshot.`);
        evidenceValue = '1.0'; // Perfect 1.0 template match
        break;

      case 'readText':
        evidenceValue = step.parameters.simulatedReadText as string || 'extracted text containing success indicator';
        logs.push(`[MOCK ADAPTER] Simulated OCR text extraction on canvas area: "${evidenceValue}"`);
        break;

      case 'upload':
        const uploadFile = step.parameters.filePath as string || '/tmp/upload.txt';
        logs.push(`[MOCK ADAPTER] Simulated reading file: '${uploadFile}' and dispatching multipart stream.`);
        break;

      case 'download':
        const downloadDest = step.target || '/tmp/downloaded-file.txt';
        logs.push(`[MOCK ADAPTER] Simulated establishing file output stream write to path: '${downloadDest}'`);
        break;

      case 'close':
        logs.push(`[MOCK ADAPTER] Simulated clean shutdown of interface target context.`);
        break;

      default:
        logs.push(`[MOCK ADAPTER] Completed default simulated operation: '${step.action}'`);
        break;
    }

    // Construct valid Evidence packet
    const evidence: Evidence = {
      id: generateId('evd'),
      executionId: context.executionId,
      stepId: step.id,
      type: step.action === 'screenshot' ? 'screenshot' : 'text_result',
      value: evidenceValue,
      createdAt: new Date(),
    };

    logs.push(`[MOCK ADAPTER] Step action completed with success status.`);
    return {
      success: true,
      logs,
      evidence,
    };
  }
}

// Private helper helpers:
function loggerInfo(msg: string, logs: string[]) {
  console.log(`[INFO] [MockAdapter] ${msg}`);
  logs.push(`[MOCK] ${msg}`);
}

function generateId(prefix = 'id'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 12; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${rand}`;
}
