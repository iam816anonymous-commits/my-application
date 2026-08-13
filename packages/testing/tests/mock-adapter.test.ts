import { test } from 'node:test';
import assert from 'node:assert';
import { MockAutomationAdapter } from '../src/index.js';
import { WorkflowStep } from '@automation-os/shared-types';

test('MockAutomationAdapter resolves click, type, and readText successful simulations', async () => {
  const adapter = new MockAutomationAdapter();

  const step: WorkflowStep = {
    id: 'stp_click_test',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'click',
    target: '.login-button',
    timeoutMs: 5000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: { mockSimulation: 'MockSuccess' },
  };

  const res = await adapter.executeStep(step, { executionId: 'exe_1', attempt: 1 });

  assert.strictEqual(res.success, true);
  assert.ok(res.evidence);
  assert.strictEqual(res.evidence.type, 'text_result');
  assert.strictEqual(res.evidence.value, 'Success');
  assert.ok(res.logs.some(l => l.includes('Step action completed')));
});

test('MockAutomationAdapter respects simulated failure conditions', async () => {
  const adapter = new MockAutomationAdapter();

  const step: WorkflowStep = {
    id: 'stp_fail_test',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'click',
    target: '.login-button',
    timeoutMs: 5000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: { mockSimulation: 'MockFailure' },
  };

  const res = await adapter.executeStep(step, { executionId: 'exe_1', attempt: 1 });

  assert.strictEqual(res.success, false);
  assert.match(res.error || '', /Simulated execution failure/);
});

test('MockAutomationAdapter handles mock low confidence matches cleanly', async () => {
  const adapter = new MockAutomationAdapter();

  const step: WorkflowStep = {
    id: 'stp_low_conf',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'screenshot',
    target: 'button.png',
    timeoutMs: 5000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: { mockSimulation: 'MockLowConfidence' },
  };

  const res = await adapter.executeStep(step, { executionId: 'exe_1', attempt: 1 });

  assert.strictEqual(res.success, true);
  assert.ok(res.evidence);
  assert.strictEqual(res.evidence.type, 'screenshot');
  assert.strictEqual(res.evidence.value, '0.82'); // Low confidence value
});

test('MockAutomationAdapter handles wait step simulations', async () => {
  const adapter = new MockAutomationAdapter();

  const step: WorkflowStep = {
    id: 'stp_wait_test',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'wait',
    target: 'time',
    timeoutMs: 5000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: { delayMs: 10 },
  };

  const start = Date.now();
  const res = await adapter.executeStep(step, { executionId: 'exe_1', attempt: 1 });
  const duration = Date.now() - start;

  assert.strictEqual(res.success, true);
  assert.ok(duration >= 10);
});
