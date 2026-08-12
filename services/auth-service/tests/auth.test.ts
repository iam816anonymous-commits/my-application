import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseService } from '../src/database.js';
import { createApp } from '../src/app.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { generateToken } from '../src/auth-utils.js';

let server: Server;
let baseUrl: string;
let db: DatabaseService;

before(() => {
  // Use isolated in-memory SQLite database for testing
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
  if (server) {
    server.close();
  }
  if (db) {
    db.close();
  }
});

test('GET /health returns OK and service status', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);

  const body = await res.json() as { status: string; service: string };
  assert.strictEqual(body.status, 'OK');
  assert.strictEqual(body.service, 'auth-service');
});

test('POST /api/auth/register creates user and default workspace, returning token', async () => {
  const payload = {
    email: 'alice@automation-os.local',
    password: 'SecurePassword123!',
    name: 'Alice Cooper',
  };

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.strictEqual(res.status, 201);

  const body = await res.json() as {
    user: { id: string; email: string; name: string };
    workspace: { id: string; name: string };
    token: string;
  };

  assert.ok(body.token);
  assert.strictEqual(body.user.email, payload.email);
  assert.strictEqual(body.user.name, payload.name);
  assert.strictEqual(body.workspace.name, "Alice Cooper's Workspace");
});

test('POST /api/auth/register rejects password violating policy complexity', async () => {
  const payload = {
    email: 'badpassword@automation-os.local',
    password: '123', // clearly violates policy
    name: 'Alice BadPass',
  };

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.strictEqual(res.status, 400);

  const body = await res.json() as { error: string; message: string };
  assert.strictEqual(body.error, 'VALIDATION_ERROR');
  assert.match(body.message, /Password does not meet complexity/);
});

test('POST /api/auth/register prevents duplicate email registrations (409 Conflict)', async () => {
  const payload = {
    email: 'duplicate@automation-os.local',
    password: 'SecurePassword123!',
    name: 'Alice Original',
  };

  // Register first user
  const res1 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(res1.status, 201);

  // Attempt duplicate registration
  const res2 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.strictEqual(res2.status, 409);

  const body = await res2.json() as { error: string; message: string };
  assert.strictEqual(body.error, 'CONFLICT_ERROR');
  assert.match(body.message, /already exists/);
});

test('POST /api/auth/login succeeds with valid credentials', async () => {
  const registerPayload = {
    email: 'login-test@automation-os.local',
    password: 'SecurePassword123!',
    name: 'Login Tester',
  };

  // 1. Register User
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });
  assert.strictEqual(regRes.status, 201);

  // 2. Login with correct password
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: registerPayload.email,
      password: registerPayload.password,
    }),
  });

  assert.strictEqual(loginRes.status, 200);

  const loginBody = await loginRes.json() as { token: string; user: { email: string } };
  assert.ok(loginBody.token);
  assert.strictEqual(loginBody.user.email, registerPayload.email);
});

test('POST /api/auth/login fails with invalid credentials', async () => {
  const registerPayload = {
    email: 'login-fail@automation-os.local',
    password: 'SecurePassword123!',
    name: 'Login Failer',
  };

  // 1. Register User
  await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });

  // 2. Login with incorrect password
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: registerPayload.email,
      password: 'WrongPassword!',
    }),
  });

  assert.strictEqual(loginRes.status, 401);

  const loginBody = await loginRes.json() as { error: string; message: string };
  assert.strictEqual(loginBody.error, 'AUTHENTICATION_ERROR');
  assert.match(loginBody.message, /Invalid email or password/);
});

test('GET /api/auth/me rejects requests with missing or invalid token', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.strictEqual(res.status, 401);

  const body = await res.json() as { error: string };
  assert.strictEqual(body.error, 'AUTHENTICATION_ERROR');
});

test('GET /api/auth/me rejects expired tokens', async () => {
  // Generate an expired token (expiresIn = -10 seconds)
  const expiredToken = generateToken({
    userId: 'usr_expired',
    email: 'expired@automation-os.local',
    workspaces: ['wsp_expired'],
  }, -10);

  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${expiredToken}` },
  });

  assert.strictEqual(res.status, 401);

  const body = await res.json() as { message: string };
  assert.match(body.message, /Token has expired/);
});

test('POST /api/auth/workspaces & GET /api/auth/workspaces manage user workspaces', async () => {
  const registerPayload = {
    email: 'workspaces-test@automation-os.local',
    password: 'SecurePassword123!',
    name: 'Workspace Alice',
  };

  // 1. Register User to get a valid token
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });
  const { token, workspace: defaultWsp } = await regRes.json() as { token: string; workspace: { id: string } };

  // 2. Fetch Workspaces (should contain only the default workspace)
  const listRes1 = await fetch(`${baseUrl}/api/auth/workspaces`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(listRes1.status, 200);

  const workspaces1 = await listRes1.json() as { id: string; name: string }[];
  assert.strictEqual(workspaces1.length, 1);
  assert.strictEqual(workspaces1[0].id, defaultWsp.id);

  // 3. Create a secondary workspace
  const createRes = await fetch(`${baseUrl}/api/auth/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Development Team' }),
  });
  assert.strictEqual(createRes.status, 201);

  const newWsp = await createRes.json() as { id: string; name: string };
  assert.strictEqual(newWsp.name, 'Development Team');

  // 4. Fetch Workspaces again (should now contain both workspaces)
  const listRes2 = await fetch(`${baseUrl}/api/auth/workspaces`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const workspaces2 = await listRes2.json() as { id: string; name: string }[];
  assert.strictEqual(workspaces2.length, 2);
  assert.ok(workspaces2.some(w => w.id === defaultWsp.id));
  assert.ok(workspaces2.some(w => w.id === newWsp.id));
});
