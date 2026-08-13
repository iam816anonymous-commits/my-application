import { test } from 'node:test';
import assert from 'node:assert';
import { AutomationWorker, JobPayload } from '../src/index.js';
import { Execution, WorkflowStep } from '@automation-os/shared-types';

test('AutomationWorker processes successful execution cleanly', async () => {
  const worker = new AutomationWorker();

  const execution: Execution = {
    id: 'exe_success',
    workspaceId: 'wsp_test_1',
    workflowId: 'wfl_test_1',
    workflowVersionId: 'ver_test_1',
    status: 'queued',
    triggeredBy: 'usr_alice',
  };

  const steps: WorkflowStep[] = [
    {
      id: 'stp_1',
      workflowVersionId: 'ver_test_1',
      order: 1,
      action: 'launch',
      target: 'http://test.url',
      timeoutMs: 5000,
      retries: 1,
      preconditions: [],
      failurePolicy: 'fail',
      parameters: { mockSimulation: 'MockSuccess' },
    }
  ];

  worker.registerMockExecution(execution, steps);

  const payload: JobPayload = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    workflowVersionId: execution.workflowVersionId,
    triggeredBy: execution.triggeredBy,
  };

  // Run job via fallback sequential memory processor
  await worker.processJob(payload, steps);

  const finalState = worker.getExecutionState(execution.id);
  assert.strictEqual(finalState?.status, 'succeeded');

  const finalSteps = worker.getExecutionSteps(execution.id);
  assert.strictEqual(finalSteps.length, 1);
  assert.strictEqual(finalSteps[0].status, 'succeeded');

  const evidence = worker.getEvidence(execution.id);
  assert.strictEqual(evidence.length, 1);
  assert.match(evidence[0].value || '', /Screenshot metadata captured/);
});

test('AutomationWorker triggers retry loops on MockFailure simulation', async () => {
  const worker = new AutomationWorker();

  const execution: Execution = {
    id: 'exe_retry_fail',
    workspaceId: 'wsp_test_1',
    workflowId: 'wfl_test_1',
    workflowVersionId: 'ver_test_1',
    status: 'queued',
    triggeredBy: 'usr_alice',
  };

  const steps: WorkflowStep[] = [
    {
      id: 'stp_fail_retry',
      workflowVersionId: 'ver_test_1',
      order: 1,
      action: 'click',
      target: '#non-existent-button',
      timeoutMs: 5000,
      retries: 3, // Enforces 3 retries
      preconditions: [],
      failurePolicy: 'fail',
      parameters: { mockSimulation: 'MockFailure' },
    }
  ];

  worker.registerMockExecution(execution, steps);

  const payload: JobPayload = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    workflowVersionId: execution.workflowVersionId,
    triggeredBy: execution.triggeredBy,
  };

  await worker.processJob(payload, steps);

  const finalState = worker.getExecutionState(execution.id);
  assert.strictEqual(finalState?.status, 'failed');

  const finalSteps = worker.getExecutionSteps(execution.id);
  assert.strictEqual(finalSteps.length, 1);
  assert.strictEqual(finalSteps[0].attempt, 3);
  assert.strictEqual(finalSteps[0].status, 'failed');
});

test('AutomationWorker respects and blocks restricted targets via policy checks', async () => {
  const worker = new AutomationWorker();

  const execution: Execution = {
    id: 'exe_blocked_policy',
    workspaceId: 'wsp_test_1',
    workflowId: 'wfl_test_1',
    workflowVersionId: 'ver_test_1',
    status: 'queued',
    triggeredBy: 'usr_alice',
  };

  const steps: WorkflowStep[] = [
    {
      id: 'stp_blocked',
      workflowVersionId: 'ver_test_1',
      order: 1,
      action: 'launch',
      target: 'http://malicious-site.com/steal-keys', // Violates policy rules
      timeoutMs: 5000,
      retries: 1,
      preconditions: [],
      failurePolicy: 'fail',
      parameters: {},
    }
  ];

  worker.registerMockExecution(execution, steps);

  const payload: JobPayload = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    workflowVersionId: execution.workflowVersionId,
    triggeredBy: execution.triggeredBy,
  };

  await worker.processJob(payload, steps);

  const finalState = worker.getExecutionState(execution.id);
  assert.strictEqual(finalState?.status, 'failed');

  const finalSteps = worker.getExecutionSteps(execution.id);
  assert.strictEqual(finalSteps.length, 1);
  assert.strictEqual(finalSteps[0].status, 'failed');
  assert.match(finalSteps[0].error || '', /Policy Violation/);
});
