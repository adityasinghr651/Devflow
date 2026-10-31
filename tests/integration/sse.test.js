import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { getRunnerManager } from '../../server/runner/manager.js';
import { generateToken } from '../../server/security/auth.js';

test('SSE Integration: Live metrics stream endpoint', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-sse-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const runner = getRunnerManager(storage);
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // Create two users
  const userA = await storage.createUser({
    id: 'user-a',
    name: 'User A',
    email: 'user-a@example.com',
    passwordHash: 'hashA',
  });
  const tokenA = generateToken(userA);

  const userB = await storage.createUser({
    id: 'user-b',
    name: 'User B',
    email: 'user-b@example.com',
    passwordHash: 'hashB',
  });
  const tokenB = generateToken(userB);

  // User A creates a run
  const activeRun = await storage.createRun({
    id: 'run-live-1',
    userId: userA.id,
    targetId: 't-1',
    targetName: 'Test Target',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
    timeoutMs: 5000,
    status: 'running',
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    successCount: 0,
    failedCount: 0,
    rps: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    errorRate: 0,
    statusCodes: {},
  });

  // 1. Unauthenticated request to SSE is rejected with 401
  const unauthRes = await fetch(`${baseUrl}/runs/${activeRun.id}/events`);
  assert.equal(unauthRes.status, 401);

  // 2. Cross-user isolation: User B cannot access User A's SSE stream (404)
  const crossUserRes = await fetch(`${baseUrl}/runs/${activeRun.id}/events`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(crossUserRes.status, 404);

  // 3. Connect via query parameter ?token= (used by browser EventSource)
  const queryParamRes = await fetch(`${baseUrl}/runs/${activeRun.id}/events?token=${tokenA}`);
  assert.equal(queryParamRes.status, 200);
  assert.equal(queryParamRes.headers.get('content-type'), 'text/event-stream');
  assert.equal(queryParamRes.headers.get('cache-control'), 'no-cache, no-transform');

  // Read initial snapshot from stream
  const reader = queryParamRes.body.getReader();
  const decoder = new TextDecoder();
  let firstChunk = '';
  const { value } = await reader.read();
  firstChunk = decoder.decode(value);
  assert.ok(firstChunk.includes('event: snapshot'));
  assert.ok(firstChunk.includes('"id":"run-live-1"'));
  await reader.cancel(); // Close client connection

  // 4. Live progress events forwarded through runner manager EventEmitter
  const liveRes = await fetch(`${baseUrl}/runs/${activeRun.id}/events`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(liveRes.status, 200);

  const liveReader = liveRes.body.getReader();
  let accumulated = '';

  // Read initial snapshot
  const chunk1 = await liveReader.read();
  accumulated += decoder.decode(chunk1.value);
  assert.ok(accumulated.includes('event: snapshot'));

  // Emit a progress event on the runner manager
  runner.events.emit(`progress:${activeRun.id}`, {
    runId: activeRun.id,
    elapsedSec: 3,
    totalRequests: 150,
    rps: 50,
    progressPercent: 30,
    currentConcurrency: 5,
  });

  const chunk2 = await liveReader.read();
  const chunk2Text = decoder.decode(chunk2.value);
  assert.ok(chunk2Text.includes('event: progress'));
  assert.ok(chunk2Text.includes('"progressPercent":30'));
  assert.ok(chunk2Text.includes('"rps":50'));

  // Emit complete event on the runner manager (should send complete, end, and close connection)
  runner.events.emit(`complete:${activeRun.id}`, {
    status: 'completed',
    totalRequests: 500,
  });

  const chunk3 = await liveReader.read();
  const chunk3Text = decoder.decode(chunk3.value);
  assert.ok(chunk3Text.includes('event: complete') || chunk3Text.includes('event: end'));

  await liveReader.cancel();

  // 5. Connecting to an already completed run emits snapshot then immediate end
  const finishedRun = await storage.createRun({
    id: 'run-finished-1',
    userId: userA.id,
    targetId: 't-1',
    targetName: 'Done Target',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 2,
    durationSec: 5,
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalRequests: 200,
    successCount: 200,
    failedCount: 0,
    rps: 40,
    p50: 10,
    p95: 15,
    p99: 20,
    errorRate: 0,
    statusCodes: { '200': 200 },
  });

  const finishedRes = await fetch(`${baseUrl}/runs/${finishedRun.id}/events`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(finishedRes.status, 200);
  const fullBody = await finishedRes.text();
  assert.ok(fullBody.includes('event: snapshot'));
  assert.ok(fullBody.includes('event: end'));
  assert.ok(fullBody.includes('"status":"completed"'));
});

