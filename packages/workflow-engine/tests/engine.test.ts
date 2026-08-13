import { test } from 'node:test';
import assert from 'node:assert';
import { ExecutionStateMachine, WorkflowExecutorPipeline, IAutomationAdapter, IVerificationEngine, IPolicyEngine, ExecutionState } from '../src/index.js';
import { Execution, WorkflowVersion } from '@automation-os/shared-types';

test('ExecutionStateMachine correctly validates state transitions', () => {
  // Valid transitions
  assert.strictEqual(ExecutionStateMachine.validateTransition('draft', 'validated'), true);
  assert.strictEqual(ExecutionStateMachine.validateTransition('queued', 'planning'), true);
  assert.strictEqual(ExecutionStateMachine.validateTransition('running', 'verifying'), true);
  assert.strictEqual(ExecutionStateMachine.validateTransition('verifying', 'succeeded'), true);

  // Invalid transitions
  assert.strictEqual(ExecutionStateMachine.validateTransition('succeeded', 'running'), false); // Succeeded is a final state
  assert.strictEqual(ExecutionStateMachine.validateTransition('failed', 'queued'), false);    // Failed is a final state
  assert.strictEqual(ExecutionStateMachine.validateTransition('queued', 'succeeded'), false);  // Cannot jump immediately to succeeded
});

test('WorkflowExecutorPipeline runs steps sequentially and handles transitions', async () => {
  const mockExecution: Execution = {
    id: 'exe_test_state',
    workspaceId: 'wsp_test',
    workflowId: 'wfl_test',
    workflowVersionId: 'ver_test',
    status: 'queued',
    triggeredBy: 'usr_alice',
  };

  const mockVersion: WorkflowVersion = {
    id: 'ver_test',
    workflowId: 'wfl_test',
    versionNumber: 1,
    steps: [
      {
        id: 'stp_1',
        workflowVersionId: 'ver_test',
        order: 1,
        action: 'launch',
        target: 'https://test.site',
        timeoutMs: 5000,
        retries: 1,
        preconditions: [],
        failurePolicy: 'fail',
        parameters: {},
      },
      {
        id: 'stp_2',
        workflowVersionId: 'ver_test',
        order: 2,
        action: 'click',
        target: '#btn-submit',
        timeoutMs: 5000,
        retries: 1,
        preconditions: [],
        failurePolicy: 'fail',
        parameters: {},
      }
    ],
    status: 'published',
    createdById: 'usr_alice',
    createdAt: new Date(),
  };

  const statesTransitioned: ExecutionState[] = [];
  const stepsRun: string[] = [];

  const mockAdapter: IAutomationAdapter = {
    id: 'test-adapter',
    capabilities: [],
    executeStep: async (step, _ctx) => {
      stepsRun.push(step.id);
      return { success: true, logs: [`Executed ${step.id}`] };
    }
  };

  const mockVerifier: IVerificationEngine = {
    verify: async (step) => ({ passed: true, logs: [`Verified ${step.id}`] })
  };

  const mockPolicy: IPolicyEngine = {
    validateStep: async () => ({ allowed: true })
  };

  const pipeline = new WorkflowExecutorPipeline(mockExecution, mockVersion, {
    adapter: mockAdapter,
    verifier: mockVerifier,
    policyEngine: mockPolicy,
    onStateTransition: async (state) => {
      statesTransitioned.push(state);
    },
    onStepProgress: async () => {},
    onEvidenceRecorded: async () => {},
  });

  await pipeline.execute();

  // Assert correct steps were run in sorted order
  assert.deepStrictEqual(stepsRun, ['stp_1', 'stp_2']);

  // Assert state machine went through standard phases
  assert.ok(statesTransitioned.includes('planning'));
  assert.ok(statesTransitioned.includes('running'));
  assert.ok(statesTransitioned.includes('succeeded'));
});
