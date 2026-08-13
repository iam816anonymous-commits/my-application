import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync } from 'node:fs';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { VerificationEngine } from '../src/index.js';
import { WorkflowStep, Evidence } from '@automation-os/shared-types';

let dummyServer: Server;
let dummyUrl: string;

const tempFilePath = './temp_verif_test.txt';
const tempFileContent = 'Hello Automation OS!';
// SHA-256 calculation of "Hello Automation OS!" is:
// 2fc62a315c9726da19d0c41d505e998cb5a0e3c30f1b24812c5d456df0571cdb
const tempFileSha256 = '2fc62a315c9726da19d0c41d505e998cb5a0e3c30f1b24812c5d456df0571cdb';

before(() => {
  // Create temp file for existence/checksum testing
  writeFileSync(tempFilePath, tempFileContent, 'utf8');

  // Start a local native HTTP server for network response testing
  dummyServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/test-200') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  dummyServer.listen(0);
  const addr = dummyServer.address() as AddressInfo;
  dummyUrl = `http://localhost:${addr.port}`;
});

after(() => {
  // Clean up temp file
  try {
    unlinkSync(tempFilePath);
  } catch (_e) {}

  if (dummyServer) {
    dummyServer.close();
  }
});

test('VerificationEngine default passes when no verification spec defined', async () => {
  const verifier = new VerificationEngine();
  const step: WorkflowStep = {
    id: 'stp_none',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'click',
    target: '#btn',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
  };

  const res = await verifier.verify(step);
  assert.strictEqual(res.passed, true);
});

test('VerificationEngine successfully asserts file_existence', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_exist',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'download',
    target: 'download.txt',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'file_existence',
      target: tempFilePath,
    }
  };

  const passRes = await verifier.verify(step);
  assert.strictEqual(passRes.passed, true);

  // Assert failure on non-existent file
  step.verification!.target = './non_existent_file_xyz.txt';
  const failRes = await verifier.verify(step);
  assert.strictEqual(failRes.passed, false);
});

test('VerificationEngine successfully asserts file_checksum matching', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_checksum',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'download',
    target: 'download.txt',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'file_checksum',
      target: tempFilePath,
      expectedValue: tempFileSha256,
    }
  };

  const passRes = await verifier.verify(step);
  assert.strictEqual(passRes.passed, true);

  // Assert failure on wrong checksum
  step.verification!.expectedValue = 'wrong-checksum-hash';
  const failRes = await verifier.verify(step);
  assert.strictEqual(failRes.passed, false);
});

test('VerificationEngine asserts process_state activity', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_proc',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'launch',
    target: 'application',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'process_state',
      target: 'node', // 'node' process is guaranteed active because we are running inside it!
      expectedValue: 'active',
    }
  };

  const passRes = await verifier.verify(step);
  assert.strictEqual(passRes.passed, true);
});

test('VerificationEngine asserts network_response status cleanly', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_net',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'launch',
    target: 'url',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'network_response',
      target: `${dummyUrl}/test-200`,
      expectedValue: '200',
    }
  };

  const passRes = await verifier.verify(step);
  assert.strictEqual(passRes.passed, true);

  // Test mismatch status code (404)
  step.verification!.target = `${dummyUrl}/test-404`;
  const failRes = await verifier.verify(step);
  assert.strictEqual(failRes.passed, false);
});

test('VerificationEngine successfully asserts text_match regular expressions', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_text',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'readText',
    target: '#status',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'text_match',
      target: '#status',
      expectedValue: 'success|completed|ok',
    }
  };

  const evidence: Evidence = {
    id: 'evd_1',
    executionId: 'exe_1',
    stepId: 'stp_text',
    type: 'text_result',
    value: 'The batch job status is completed.',
    createdAt: new Date(),
  };

  const passRes = await verifier.verify(step, evidence);
  assert.strictEqual(passRes.passed, true);

  // Test regex mismatch
  evidence.value = 'The job failed unexpectedly.';
  const failRes = await verifier.verify(step, evidence);
  assert.strictEqual(failRes.passed, false);
});

test('VerificationEngine successfully asserts screenshot_match thresholds', async () => {
  const verifier = new VerificationEngine();

  const step: WorkflowStep = {
    id: 'stp_screenshot',
    workflowVersionId: 'ver_1',
    order: 1,
    action: 'screenshot',
    target: 'button-template.png',
    timeoutMs: 1000,
    retries: 1,
    preconditions: [],
    failurePolicy: 'fail',
    parameters: {},
    verification: {
      type: 'screenshot_match',
      target: 'button-template.png',
      threshold: 0.90,
    }
  };

  const evidence: Evidence = {
    id: 'evd_1',
    executionId: 'exe_1',
    stepId: 'stp_screenshot',
    type: 'screenshot',
    value: '0.97', // Similarity 0.97 > 0.90
    createdAt: new Date(),
  };

  const passRes = await verifier.verify(step, evidence);
  assert.strictEqual(passRes.passed, true);

  // Test below threshold
  evidence.value = '0.84'; // 0.84 < 0.90
  const failRes = await verifier.verify(step, evidence);
  assert.strictEqual(failRes.passed, false);
});
