import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseService } from '../src/database.js';
import { createApp } from '../src/app.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

let server: Server;
let baseUrl: string;
let db: DatabaseService;

const mockUserContext = {
  userId: 'usr_alice',
  email: 'alice@automation-os.local',
  workspaces: ['wsp_test_workspace'],
};

before(() => {
  db = new DatabaseService(':memory:');
  db.initialize();

  const app = createApp(db);
  server = app.listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://localhost:${address.port}`;
});

beforeEach(() => {
  db.clearAllTables();
});

after(() => {
  if (server) server.close();
  if (db) db.close();
});

test('GET /health returns OK', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json() as { status: string };
  assert.strictEqual(body.status, 'OK');
});

test('POST /api/workflows creates a workflow and version 1 cleanly', async () => {
  const payload = {
    workspaceId: 'wsp_test_workspace',
    name: 'Browser Login Automation',
    description: 'Automates testing login flow',
    targetApplicationId: 'app_chrome',
    environment: 'production',
    tags: ['web', 'critical'],
    steps: [
      {
        action: 'launch',
        target: 'https://github.com',
        timeoutMs: 10000,
        retries: 2,
        preconditions: [],
        failurePolicy: 'fail',
        parameters: { headless: true },
      },
      {
        action: 'click',
        target: '.login-btn',
        timeoutMs: 5000,
        retries: 1,
        preconditions: ['page_loaded'],
        failurePolicy: 'retry',
        parameters: {},
      }
    ],
  };

  const res = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-context': JSON.stringify(mockUserContext),
    },
    body: JSON.stringify(payload),
  });

  assert.strictEqual(res.status, 201);
  const body = await res.json() as {
    workflow: { id: string; name: string; workspaceId: string; status: string };
    version: { id: string; versionNumber: number; steps: any[] };
  };

  assert.ok(body.workflow.id);
  assert.strictEqual(body.workflow.name, payload.name);
  assert.strictEqual(body.workflow.status, 'draft');
  assert.strictEqual(body.version.versionNumber, 1);
  assert.strictEqual(body.version.steps.length, 2);
  assert.strictEqual(body.version.steps[0].action, 'launch');
  assert.strictEqual(body.version.steps[1].order, 2);
});

test('POST /api/workflows rejects unauthorized workspace access', async () => {
  const payload = {
    workspaceId: 'wsp_some_other_workspace', // Alice has no access
    name: 'Steal Data Automation',
    targetApplicationId: 'app_chrome',
    environment: 'production',
  };

  const res = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-context': JSON.stringify(mockUserContext),
    },
    body: JSON.stringify(payload),
  });

  assert.strictEqual(res.status, 403);
  const body = await res.json() as { error: string; message: string };
  assert.strictEqual(body.error, 'AUTHORIZATION_ERROR');
});

test('GET /api/workflows lists workflows inside a workspace', async () => {
  const wsId = 'wsp_test_workspace';

  // 1. Pre-populate a workflow
  await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-context': JSON.stringify(mockUserContext),
    },
    body: JSON.stringify({
      workspaceId: wsId,
      name: 'Flow 1',
      targetApplicationId: 'app_vlc',
      environment: 'development',
    }),
  });

  // 2. Fetch workflows list
  const listRes = await fetch(`${baseUrl}/api/workflows?workspaceId=${wsId}`, {
    headers: {
      'x-user-context': JSON.stringify(mockUserContext),
    },
  });

  assert.strictEqual(listRes.status, 200);
  const list = await listRes.json() as any[];
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, 'Flow 1');
});

test('POST & GET workflows versions manages non-destructive step histories', async () => {
  const wsId = 'wsp_test_workspace';

  // 1. Create Workflow (creates v1)
  const createRes = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-context': JSON.stringify(mockUserContext),
    },
    body: JSON.stringify({
      workspaceId: wsId,
      name: 'Versioned Flow',
      targetApplicationId: 'app_chrome',
      environment: 'staging',
    }),
  });
  const { workflow } = await createRes.json() as { workflow: { id: string }; version: { id: string } };

  // 2. Create version 2 (via POST /api/workflows/:id/versions)
  const v2Res = await fetch(`${baseUrl}/api/workflows/${workflow.id}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-context': JSON.stringify(mockUserContext),
    },
    body: JSON.stringify({
      steps: [
        { action: 'type', target: 'input#username', parameters: { text: 'admin' } }
      ]
    }),
  });
  assert.strictEqual(v2Res.status, 201);
  const v2 = await v2Res.json() as { id: string; versionNumber: number; steps: any[] };
  assert.strictEqual(v2.versionNumber, 2);
  assert.strictEqual(v2.steps.length, 1);

  // 3. Publish version 2
  const publishRes = await fetch(`${baseUrl}/api/workflows/${workflow.id}/versions/${v2.id}/publish`, {
    method: 'POST',
    headers: {
      'x-user-context': JSON.stringify(mockUserContext),
    },
  });
  assert.strictEqual(publishRes.status, 200);
  const publishBody = await publishRes.json() as { workflow: { status: string }; version: { status: string } };
  assert.strictEqual(publishBody.workflow.status, 'published');
  assert.strictEqual(publishBody.version.status, 'published');
});
