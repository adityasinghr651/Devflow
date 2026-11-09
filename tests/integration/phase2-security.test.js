import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/app.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { setStorage } from '../../server/storage/index.js';
import { getRunnerManager } from '../../server/runner/manager.js';
import { hashPassword, generateToken } from '../../server/security/auth.js';
import { createTestTargetServer, TARGET_CONFIG } from '../../tools/test-target.js';
import { config } from '../../server/config.js';

test('Phase 2: security headers, body size, quota enforcement, stream tickets, and audit isolation', async t => {
  process.env.RUNNER_ENGINE = 'node';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-phase2-'));
  const storage = new JsonStorage(tempDir);
  await storage.init();
  setStorage(storage);
  const runner = getRunnerManager(storage);
  const targetServer = createTestTargetServer();
  await new Promise(resolve => targetServer.listen(0, TARGET_CONFIG.host, resolve));
  const apiServer = http.createServer(createApp());
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${apiServer.address().port}/api`;
  const targetUrl = `http://${TARGET_CONFIG.host}:${targetServer.address().port}`;
  const userA = await storage.createUser({ email: 'phase2a@example.test', passwordHash: await hashPassword('ValidPhase2Password123!'), name: 'Phase 2 A' });
  const userB = await storage.createUser({ email: 'phase2b@example.test', passwordHash: await hashPassword('ValidPhase2Password123!'), name: 'Phase 2 B' });
  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);
  const target = await storage.createTarget({ id: randomUUID(), userId: userA.id, name: 'Loopback fixture', url: targetUrl, verified: true });
  const createdRunIds = [];
  const originalQuotas = {
    maxActiveRunsPerUser: config.maxActiveRunsPerUser,
    maxRunsPerDay: config.maxRunsPerDay,
    maxVuSecondsPerDay: config.maxVuSecondsPerDay,
  };

  t.after(async () => {
    Object.assign(config, originalQuotas);
    for (const run of await storage.getRuns()) if (['queued', 'validating', 'running', 'cancelling'].includes(run.status)) await runner.cancelRun(run.id).catch(() => {});
    const deadline = Date.now() + 3000;
    while (runner.activeRuns.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    await storage.writeQueue;
    await new Promise(resolve => apiServer.close(resolve));
    await new Promise(resolve => targetServer.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const missingLogin = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'missing@example.test', password: 'wrong-password' }),
  });
  const wrongPassword = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userA.email, password: 'wrong-password' }),
  });
  assert.equal(missingLogin.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.equal((await missingLogin.json()).error, (await wrongPassword.json()).error);
  assert.equal((await fetch(`${api}/audit-events`)).status, 401);
  assert.equal((await fetch(`${api}/targets`)).status, 401);
  assert.equal((await fetch(`${api}/runs`)).status, 401);

  const duplicateRegistration = await fetch(`${api}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userA.email, name: 'Duplicate', password: 'ValidPhase2Password123!' }),
  });
  assert.equal(duplicateRegistration.status, 409);
  assert.equal((await duplicateRegistration.json()).error, 'An account with this email already exists.');

  const allowedOrigin = await fetch(`${api}/health`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(allowedOrigin.headers.get('x-frame-options'), 'DENY');
  assert.equal(allowedOrigin.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(allowedOrigin.headers.get('x-request-id'));
  const ready = await fetch(`${api}/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ready');
  const deniedOrigin = await fetch(`${api}/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);
  const oversized = await fetch(`${api}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: 'x'.repeat(70_000) }),
  });
  assert.equal(oversized.status, 413);

  for (let index = 0; index < 3; index++) {
    const response = await fetch(`${api}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ targetId: target.id, path: '/hang', concurrency: 1, durationSec: 20, timeoutMs: 5000, authorized: true }),
    });
    assert.equal(response.status, 202);
    createdRunIds.push((await response.json()).id);
  }
  const quotaDenied = await fetch(`${api}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ targetId: target.id, path: '/hang', concurrency: 1, durationSec: 20, authorized: true }),
  });
  assert.equal(quotaDenied.status, 429);
  assert.equal(quotaDenied.headers.get('retry-after'), '60');
  assert.equal((await quotaDenied.json()).quota, 'active_run_limit');

  config.maxActiveRunsPerUser = 10;
  config.maxRunsPerDay = 3;
  const dailyDenied = await fetch(`${api}/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ targetId: target.id, path: '/hang', concurrency: 1, durationSec: 20, authorized: true }),
  });
  assert.equal(dailyDenied.status, 429);
  assert.equal((await dailyDenied.json()).quota, 'daily_run_limit');

  config.maxRunsPerDay = 100;
  config.maxVuSecondsPerDay = 70;
  const vuSecondsDenied = await fetch(`${api}/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ targetId: target.id, path: '/hang', concurrency: 1, durationSec: 20, authorized: true }),
  });
  assert.equal(vuSecondsDenied.status, 429);
  assert.equal((await vuSecondsDenied.json()).quota, 'daily_vu_seconds_limit');

  const deniedTicket = await fetch(`${api}/runs/${createdRunIds[0]}/events-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(deniedTicket.status, 404);
  const ticketResponse = await fetch(`${api}/runs/${createdRunIds[0]}/events-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(ticketResponse.status, 200);
  const { ticket } = await ticketResponse.json();
  const stream = await fetch(`${api}/runs/${createdRunIds[0]}/events?ticket=${ticket}`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  await stream.body.cancel();
  const replay = await fetch(`${api}/runs/${createdRunIds[0]}/events?ticket=${ticket}`);
  assert.equal(replay.status, 401);
  const legacyJwtQuery = await fetch(`${api}/runs/${createdRunIds[0]}/events?token=${tokenA}`);
  assert.equal(legacyJwtQuery.status, 401);

  const auditA = await fetch(`${api}/audit-events`, { headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(auditA.status, 200);
  const events = await auditA.json();
  assert.ok(events.some(event => event.action === 'RUN_QUOTA_DENIED'));
  assert.ok(events.every(event => event.userId === userA.id));
  const auditB = await fetch(`${api}/audit-events`, { headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(auditB.status, 200);
  assert.ok((await auditB.json()).every(event => event.userId === userB.id));
});
