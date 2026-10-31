import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';

test('API: Full Auth and API workflow test suite', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-api-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // 1. Health check is public
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'ok');

  // 2. Protected routes reject unauthenticated requests with 401
  const unauthTargets = await fetch(`${baseUrl}/targets`);
  assert.equal(unauthTargets.status, 401);

  const unauthRuns = await fetch(`${baseUrl}/runs`);
  assert.equal(unauthRuns.status, 401);

  // 3. User Registration
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Aditya Singh',
      email: 'aditya@example.com',
      password: 'StrongPassword123!',
    }),
  });
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.ok(regData.token);
  assert.equal(regData.user.email, 'aditya@example.com');
  const token = regData.token;

  // 4. Duplicate registration rejected with 409
  const dupRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Aditya Clone',
      email: 'aditya@example.com',
      password: 'StrongPassword123!',
    }),
  });
  assert.equal(dupRes.status, 409);

  // 5. User Login with bad password returns 401
  const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'aditya@example.com',
      password: 'WrongPassword!',
    }),
  });
  assert.equal(badLoginRes.status, 401);

  // 6. User Login success
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'aditya@example.com',
      password: 'StrongPassword123!',
    }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.token);

  // 7. Verify session with /auth/me
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.email, 'aditya@example.com');

  // 8. Register target with authentication
  const createTargetRes = await fetch(`${baseUrl}/targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Local API Test',
      url: 'http://localhost:3000',
      environment: 'Development',
    }),
  });
  assert.equal(createTargetRes.status, 201);
  const target = await createTargetRes.json();
  assert.ok(target.id);
  assert.equal(target.name, 'Local API Test');

  // 9. Unauthorized run rejection (unauthorized confirmation checkbox false)
  const unauthRunRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      targetId: target.id,
      path: '/health',
      method: 'GET',
      concurrency: 2,
      durationSec: 1,
      authorized: false,
    }),
  });
  assert.equal(unauthRunRes.status, 403);

  // 10. Authorized run creation
  const createRunRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      targetId: target.id,
      path: '/health',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
      authorized: true,
    }),
  });
  assert.equal(createRunRes.status, 202);
  const run = await createRunRes.json();
  assert.ok(run.id);

  // 11. Delete target blocked while run is queued/running
  const deleteTargetBlocked = await fetch(`${baseUrl}/targets/${target.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteTargetBlocked.status, 409);

  // 12. Cancel the active run
  const cancelRes = await fetch(`${baseUrl}/runs/${run.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(cancelRes.status, 200);

  // 13. Logout
  const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(logoutRes.status, 200);

  // 14. OAuth Social Login (GitHub & Google)
  const ghRes = await fetch(`${baseUrl}/auth/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'github',
      email: 'octocat@github.com',
      name: 'The Octocat',
      providerId: 'gh_12345',
    }),
  });
  assert.equal(ghRes.status, 200);
  const ghData = await ghRes.json();
  assert.ok(ghData.token);
  assert.equal(ghData.user.email, 'octocat@github.com');
  assert.equal(ghData.user.name, 'The Octocat');

  // Google OAuth sign-in with existing or new user
  const googleRes = await fetch(`${baseUrl}/auth/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      email: 'alex@google.com',
      name: 'Alex Developer',
      providerId: 'goog_9988',
    }),
  });
  assert.equal(googleRes.status, 200);
  const googleData = await googleRes.json();
  assert.ok(googleData.token);
  assert.equal(googleData.user.email, 'alex@google.com');

  // Invalid OAuth provider rejected
  const badProvider = await fetch(`${baseUrl}/auth/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'unsupported_social',
      email: 'fake@example.com',
    }),
  });
  assert.equal(badProvider.status, 400);
});
