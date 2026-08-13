import { test, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createGatewayApp } from '../src/app.js';
import { config } from '@automation-os/config';

let gatewayServer: Server;
let mockAuthServer: Server;
let mockAutoServer: Server;

let gatewayUrl: string;

before(async () => {
  // 1. Create a mock downstream Auth Service
  const mockAuthApp = express();
  mockAuthApp.get('/api/auth/test', (_req, res) => {
    res.status(200).json({ ok: true, source: 'auth-service' });
  });
  mockAuthServer = mockAuthApp.listen(0);
  const authAddr = mockAuthServer.address() as AddressInfo;

  // 2. Create a mock downstream Automation Service
  const mockAutoApp = express();
  mockAutoApp.get('/api/workflows/test', (_req, res) => {
    res.status(200).json({ ok: true, source: 'automation-service' });
  });
  mockAutoServer = mockAutoApp.listen(0);
  const autoAddr = mockAutoServer.address() as AddressInfo;

  // 3. Configure the globally imported config ports to point to our mock servers
  config.AUTH_SERVICE_PORT = authAddr.port;
  config.AUTOMATION_SERVICE_PORT = autoAddr.port;

  // 4. Start the API Gateway
  const gatewayApp = createGatewayApp();
  gatewayServer = gatewayApp.listen(0);
  const gatewayAddr = gatewayServer.address() as AddressInfo;
  gatewayUrl = `http://localhost:${gatewayAddr.port}`;
});

after(() => {
  if (gatewayServer) gatewayServer.close();
  if (mockAuthServer) mockAuthServer.close();
  if (mockAutoServer) mockAutoServer.close();
});

test('Gateway injects Request ID header into client responses', async () => {
  const res = await fetch(`${baseUrl()}/health`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers.get('x-request-id'));
});

test('Gateway enforces secure CORS & Security headers on responses', async () => {
  const res = await fetch(`${baseUrl()}/health`);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
});

test('Gateway routes /api/auth/* requests to downstream Auth Service', async () => {
  const res = await fetch(`${baseUrl()}/api/auth/test`);
  assert.strictEqual(res.status, 200);

  const body = await res.json() as { source: string; ok: boolean };
  assert.strictEqual(body.source, 'auth-service');
  assert.strictEqual(body.ok, true);
});

test('Gateway routes /api/workflows* requests to downstream Automation Service', async () => {
  const res = await fetch(`${baseUrl()}/api/workflows/test`);
  assert.strictEqual(res.status, 200);

  const body = await res.json() as { source: string; ok: boolean };
  assert.strictEqual(body.source, 'automation-service');
  assert.strictEqual(body.ok, true);
});

function baseUrl(): string {
  return gatewayUrl;
}
