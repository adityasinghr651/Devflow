import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';

test('Telemetry & Accuracy: Real runs are not demo and reflect measured delay', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-real-telemetry-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  // Create a controlled HTTP target that introduces exactly 50ms delay per request
  let requestCount = 0;
  const mockServer = http.createServer((req, res) => {
    requestCount++;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delay: 50, reqNum: requestCount }));
    }, 50);
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const targetUrl = `http://127.0.0.1:${port}/slow?ms=50`;

  t.after(async () => {
    await new Promise((resolve) => mockServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // 1. Authenticated user and target setup
  const user = await storage.createUser({
    email: 'engineer@devflow.internal',
    passwordHash: 'argon_hash_dummy',
    name: 'Performance Engineer',
  });

  const target = await storage.createTarget({
    userId: user.id,
    name: 'Controlled Delay Server',
    url: `http://127.0.0.1:${port}`,
    environment: 'Development',
    verified: true,
  });

  const runner = new RunnerManager(storage);

  // 2. Real run payload matching run_o2d86p parameters (concurrency: 5, durationSec: 2 for fast test)
  const runRecord = {
    id: randomUUID(),
    userId: user.id,
    targetId: target.id,
    targetName: target.name,
    url: targetUrl,
    method: 'GET',
    concurrency: 5,
    durationSec: 2,
    workerCount: 1,
    profile: 'fixed',
    stages: [],
    headers: { 'Accept': 'application/json' },
    body: null,
    timeoutMs: 5000,
    status: 'queued',
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
  };

  await storage.createRun(runRecord);
  await runner.enqueueRun(runRecord);

  // 3. Wait for execution to reach terminal state
  const deadline = Date.now() + 10000;
  let completedRun = null;
  while (Date.now() < deadline) {
    const current = await storage.getRunById(runRecord.id, user.id);
    if (current && ['completed', 'failed', 'cancelled', 'timed_out'].includes(current.status)) {
      completedRun = current;
      break;
    }
    await new Promise((res) => setTimeout(res, 150));
  }

  assert.ok(completedRun, 'Run did not reach terminal state within deadline');
  assert.strictEqual(completedRun.status, 'completed');

  // 4. REQUIREMENT 2 & 4: Real run must NOT be marked isDemo
  assert.strictEqual(completedRun.isDemo, undefined, 'Real execution must not have isDemo set to true');
  assert.notStrictEqual(completedRun.isDemo, true);

  // 5. REQUIREMENT 5 & 6: Latency percentiles must reflect the actual 50ms delay
  // p50 must be >= 45ms and p95 must be >= 48ms
  assert.ok(
    completedRun.p50 >= 45,
    `p50 latency (${completedRun.p50}ms) must reflect the 50ms server delay (expected >= 45ms)`
  );
  assert.ok(
    completedRun.p95 >= 48,
    `p95 latency (${completedRun.p95}ms) must reflect the 50ms server delay (expected >= 48ms)`
  );

  // 6. REQUIREMENT 5: Request count must be physically bounded
  // With 5 concurrency and 50ms delay, each slot completes ~20 req/s.
  // Over 2 seconds, maximum possible requests is 5 * 20 * 2 = 200 requests.
  // It must NOT be simulated thousands (e.g. 7608).
  assert.ok(
    completedRun.totalRequests >= 50 && completedRun.totalRequests <= 250,
    `totalRequests (${completedRun.totalRequests}) must match physical throughput for 5 VUs over 2s with 50ms delay`
  );
  assert.strictEqual(completedRun.successCount, completedRun.totalRequests);
  assert.strictEqual(completedRun.failedCount, 0);
  assert.strictEqual(completedRun.statusCodes['200'], completedRun.totalRequests);
  assert.strictEqual(completedRun.errorRate, 0);

  // 7. Histogram Tiers: 50ms belongs in Tier 2 [20.00ms, 100.00ms)
  assert.ok(completedRun.tiers, 'Completed run must include HDR histogram tiers');
  assert.ok(
    completedRun.tiers.tier2Count > 0,
    'Tier 2 [20-100ms] must contain the 50ms delayed requests'
  );
  assert.ok(
    completedRun.tiers.tier2Pct >= 70,
    `Tier 2 percentage (${completedRun.tiers.tier2Pct}%) must represent majority of 50ms requests`
  );

  // 8. REQUIREMENT 7: Verify run persistence across fresh re-instantiation (sign out & back in)
  const freshStorage = new JsonStorage(tmpDir);
  await freshStorage.init();

  const persistedRuns = await freshStorage.getRuns(user.id);
  assert.strictEqual(persistedRuns.length, 1, 'Run must persist to disk across sessions');

  const reloadedRun = persistedRuns[0];
  assert.strictEqual(reloadedRun.id, completedRun.id);
  assert.strictEqual(reloadedRun.totalRequests, completedRun.totalRequests);
  assert.strictEqual(reloadedRun.successCount, completedRun.successCount);
  assert.strictEqual(reloadedRun.p50, completedRun.p50);
  assert.strictEqual(reloadedRun.p95, completedRun.p95);
  assert.strictEqual(reloadedRun.p99, completedRun.p99);
  assert.strictEqual(reloadedRun.isDemo, undefined);
  assert.strictEqual(reloadedRun.status, 'completed');
});

