import { AuditEvent, Execution, ExecutionStep, Workflow, WorkflowStep } from '@automation-os/shared-types';

export interface BaseEvent {
  id: string;
  timestamp: string;
  workspaceId: string;
}

export interface WorkflowCreatedEvent extends BaseEvent {
  type: 'workflow.created';
  data: {
    workflow: Workflow;
  };
}

export interface WorkflowUpdatedEvent extends BaseEvent {
  type: 'workflow.updated';
  data: {
    workflow: Workflow;
  };
}

export interface ExecutionQueuedEvent extends BaseEvent {
  type: 'execution.queued';
  data: {
    execution: Execution;
  };
}

export interface ExecutionStartedEvent extends BaseEvent {
  type: 'execution.started';
  data: {
    execution: Execution;
  };
}

export interface StepStartedEvent extends BaseEvent {
  type: 'step.started';
  data: {
    executionId: string;
    step: WorkflowStep;
  };
}

export interface StepCompletedEvent extends BaseEvent {
  type: 'step.completed';
  data: {
    executionId: string;
    executionStep: ExecutionStep;
  };
}

export interface ExecutionCompletedEvent extends BaseEvent {
  type: 'execution.completed';
  data: {
    execution: Execution;
  };
}

export interface AuditEventCreatedEvent extends BaseEvent {
  type: 'audit.created';
  data: {
    event: AuditEvent;
  };
}

export type AutomationEvent =
  | WorkflowCreatedEvent
  | WorkflowUpdatedEvent
  | ExecutionQueuedEvent
  | ExecutionStartedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | ExecutionCompletedEvent
  | AuditEventCreatedEvent;
