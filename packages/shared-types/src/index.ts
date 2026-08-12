export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
}

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  ownerId: string;
  targetApplicationId: string;
  environment: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  steps: WorkflowStep[];
  status: 'draft' | 'published';
  createdById: string;
  createdAt: Date;
}

export interface WorkflowStep {
  id: string;
  workflowVersionId: string;
  order: number;
  action:
    | 'launch'
    | 'connect'
    | 'find'
    | 'click'
    | 'doubleClick'
    | 'type'
    | 'press'
    | 'scroll'
    | 'drag'
    | 'wait'
    | 'readText'
    | 'screenshot'
    | 'upload'
    | 'download'
    | 'execute'
    | 'verify'
    | 'close';
  target: string; // CSS Selector, Control ID, Image template path, or coordinates
  adapterPreference?: string;
  timeoutMs: number;
  retries: number;
  preconditions: string[]; // List of precondition assertions to run
  verification?: VerificationSpec;
  failurePolicy: 'fail' | 'retry' | 'ignore' | 'recover';
  parameters: Record<string, string | number | boolean>;
}

export interface VerificationSpec {
  type:
    | 'ui_state'
    | 'dom_state'
    | 'control_existence'
    | 'text_match'
    | 'ocr_match'
    | 'screenshot_match'
    | 'file_existence'
    | 'file_checksum'
    | 'process_state'
    | 'network_response'
    | 'api_response'
    | 'window_existence'
    | 'application_state';
  target: string;
  expectedValue?: string;
  threshold?: number; // e.g., confidence or similarity threshold
}

export interface Execution {
  id: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  jobId?: string; // BullMQ Job ID
  idempotencyKey?: string;
  status:
    | 'draft'
    | 'validated'
    | 'queued'
    | 'planning'
    | 'running'
    | 'waiting'
    | 'verifying'
    | 'recovering'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'timed_out'
    | 'manual_intervention';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  triggeredBy: string; // User ID, System, or Schedule ID
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  stepId: string; // Reference to WorkflowStep id
  status: 'pending' | 'running' | 'verifying' | 'succeeded' | 'failed' | 'skipped';
  attempt: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  logs: string[];
}

export interface Artifact {
  id: string;
  executionId: string;
  stepId?: string;
  type: 'screenshot' | 'recording' | 'downloaded_file' | 'uploaded_file' | 'report';
  mimeType: string;
  size: number;
  checksum: string; // SHA-256
  storageKey: string; // Local path or S3 key
  createdAt: Date;
}

export interface Evidence {
  id: string;
  executionId: string;
  stepId: string;
  type: 'screenshot' | 'dom_snapshot' | 'control_tree' | 'ocr_result' | 'text_result' | 'file' | 'hash' | 'api_response' | 'process_state';
  value?: string; // Textual evidence (e.g. OCR result, API response string)
  artifactId?: string; // Reference to larger binary artifacts
  createdAt: Date;
}

export interface Policy {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  ruleType:
    | 'allowed_applications'
    | 'allowed_domains'
    | 'allowed_directories'
    | 'allowed_file_operations'
    | 'allowed_network_operations'
    | 'allowed_adapters'
    | 'credential_access'
    | 'command_execution'
    | 'dangerous_operations';
  rulePayload: Record<string, string[] | boolean | string>; // Rule-specific configuration
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialReference {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  secretKeyRef: string; // Path or key identifier in CredentialStore
  createdAt: Date;
  updatedAt: Date;
}

export interface Adapter {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  status: 'active' | 'inactive';
  lastSeenAt?: Date;
}

export interface Schedule {
  id: string;
  workspaceId: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  status: 'active' | 'inactive';
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  userId?: string;
  action:
    | 'WorkflowCreated'
    | 'WorkflowUpdated'
    | 'WorkflowPublished'
    | 'ExecutionQueued'
    | 'ExecutionStarted'
    | 'StepStarted'
    | 'StepCompleted'
    | 'VerificationPassed'
    | 'VerificationFailed'
    | 'ExecutionRetried'
    | 'ExecutionFailed'
    | 'ExecutionCancelled'
    | 'ManualInterventionRequired'
    | 'ExecutionCompleted';
  entityId: string; // ID of workflow, execution, etc.
  entityType: 'workflow' | 'execution' | 'policy' | 'schedule' | 'credential';
  metadata: Record<string, string | number | boolean>;
  timestamp: Date;
}
