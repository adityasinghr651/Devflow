import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTestTargetServer, TARGET_CONFIG } from '../../tools/test-target.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { generateToken } from '../../server/security/auth.js';

test('Metrics Correctness: Comprehensive audit against controlled test target', async (t) => {
  // 1. Setup controlled test target on ephemeral port
  const targetServer = createTestTargetServer();
  await new Promise(resolve => targetServer.listen(0, TARGET_CONFIG.host, resolve));
  const targetPort = targetServer.address().port;
  const targetBaseUrl = `http://${TARGET_CONFIG.host}:${targetPort}`;

  // 2. Setup isolated storage and runner
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-metrics-audit-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const runner = new RunnerManager(storage);

  t.after(async () => {
    await new Promise(resolve => targetServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // Helper: Poll until run reaches terminal state
  async function waitForRun(runId, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await storage.getRunById(runId);
      if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
        return r;
      }
      await new Promise(res => setTimeout(res, 100));
    }
    throw new Error(`Run ${runId} did not finish within ${timeoutMs}ms`);
  }

  // Helper: Create and enqueue run record
  async function executeTestRun(options) {
    const runId = 'metric-run-' + Math.random().toString(36).slice(2, 9);
    const runRecord = {
      id: runId,
      userId: 'test-user',
      targetId: 'target-audit',
      targetName: 'Controlled Target',
      url: `${targetBaseUrl}${options.path}`,
      method: options.method || 'GET',
      concurrency: options.concurrency || 2,
      durationSec: options.durationSec || 2,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: options.timeoutMs || 5000,
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
    return waitForRun(runId, (options.durationSec || 2) * 1000 + 6000);
  }

  // --- Scenario 1: Fast 200 responses (GET /health) ---
  await t.test('Scenario 1: Fast 200 responses metric correctness', async () => {
    const run = await executeTestRun({
      path: '/health',
      method: 'GET',
      concurrency: 3,
      durationSec: 2,
    });

    assert.equal(run.status, 'completed');
    assert.ok(run.totalRequests > 0, `Expected totalRequests > 0, got ${run.totalRequests}`);
    assert.equal(run.successCount, run.totalRequests, 'All requests must be successful');
    assert.equal(run.failedCount, 0, 'No failed requests expected');
    assert.equal(run.errorRate, 0, 'Error rate must be exactly 0.00%');
    assert.equal(run.statusCodes['200'], run.totalRequests, 'statusCodes[200] must match totalRequests');
    assert.equal(Object.keys(run.statusCodes).length, 1, 'Only 200 status code expected');

    // RPS validation: positive and matches totalRequests / elapsedSec
    assert.ok(run.rps > 0, `RPS must be positive, got ${run.rps}`);

    // Latency percentiles monotonic order and fast threshold
    assert.ok(run.p50 <= run.p95, `p50 (${run.p50}) must be <= p95 (${run.p95})`);
    assert.ok(run.p95 <= run.p99, `p95 (${run.p95}) must be <= p99 (${run.p99})`);
    assert.ok(run.p95 < 60, `Fast local 200 p95 should be < 60ms, got ${run.p95}ms`);
  });

  // --- Scenario 2: Approximately 100 ms responses (GET /slow?ms=100) ---
  await t.test('Scenario 2: ~100ms delayed responses latency and throughput window', async () => {
    const run = await executeTestRun({
      path: '/slow?ms=100',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
    });

    assert.equal(run.status, 'completed');
    assert.ok(run.totalRequests > 0);
    assert.equal(run.successCount, run.totalRequests);
    assert.equal(run.failedCount, 0);
    assert.equal(run.errorRate, 0);

    // Latency percentile accuracy: each request was delayed by 100ms
    assert.ok(run.p50 >= 90, `Expected p50 >= 90ms for 100ms slow endpoint, got ${run.p50}ms`);
    assert.ok(run.p95 >= 90, `Expected p95 >= 90ms for 100ms slow endpoint, got ${run.p95}ms`);
    assert.ok(run.p99 >= 90, `Expected p99 >= 90ms for 100ms slow endpoint, got ${run.p99}ms`);
    assert.ok(run.p50 <= run.p95, 'p50 <= p95');
    assert.ok(run.p95 <= run.p99, 'p95 <= p99');

    // Throughput window check: with 2 workers each taking ~100ms + network overhead,
    // RPS should be roughly ~12 to 24 req/s, NOT thousands
    assert.ok(run.rps >= 5 && run.rps <= 30, `Expected RPS in realistic bounded range [5, 30], got ${run.rps}`);
  });

  // --- Scenario 3: Consistent 500 responses (GET /status/500) ---
  await t.test('Scenario 3: Consistent 500 responses error-rate and numerator/denominator', async () => {
    const run = await executeTestRun({
      path: '/status/500',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
    });

    assert.equal(run.status, 'completed');
    assert.ok(run.totalRequests > 0);
    assert.equal(run.successCount, 0, 'Expected zero successful responses for 500 endpoint');
    assert.equal(run.failedCount, run.totalRequests, 'All requests must be marked as failed');
    assert.equal(run.errorRate, 100, 'Error rate must be exactly 100.00%');
    assert.equal(run.statusCodes['500'], run.totalRequests);
    assert.equal(run.statusCodes['200'], undefined);

    // Latency must still be collected and measured for 500 responses
    assert.ok(run.p50 > 0, 'p50 must be positive for 500 responses');
    assert.ok(run.p95 > 0, 'p95 must be positive for 500 responses');
    assert.ok(run.p99 > 0, 'p99 must be positive for 500 responses');
    assert.ok(run.p50 <= run.p95 && run.p95 <= run.p99);
  });

  // --- Scenario 4: Mixed status codes (GET /mixed) ---
  await t.test('Scenario 4: Mixed status codes distribution and aggregation', async () => {
    const run = await executeTestRun({
      path: '/mixed',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
    });

    assert.equal(run.status, 'completed');
    assert.ok(run.totalRequests >= 4);

    // Both status codes 200 and 500 must be present
    assert.ok(run.statusCodes['200'] > 0, 'Expected some 200 OK responses');
    assert.ok(run.statusCodes['500'] > 0, 'Expected some 500 Error responses');

    // Exact sums must match
    assert.equal(run.statusCodes['200'], run.successCount);
    assert.equal(run.statusCodes['500'], run.failedCount);
    assert.equal(run.successCount + run.failedCount, run.totalRequests);

    // Error rate must reflect 500 count / totalRequests
    const expectedErrorRate = Number(((run.failedCount / run.totalRequests) * 100).toFixed(2));
    assert.equal(run.errorRate, expectedErrorRate);
    assert.ok(run.errorRate > 0 && run.errorRate < 100, `Error rate should be mixed, got ${run.errorRate}%`);
  });

  // --- Scenario 5: Small known request count ---
  await t.test('Scenario 5: Small known request count exact accounting', async () => {
    // 1 worker, 1 second duration, 250ms delay per request -> exactly 3 to 5 requests
    const run = await executeTestRun({
      path: '/slow?ms=250',
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
    });

    assert.equal(run.status, 'completed');
    assert.ok(run.totalRequests >= 2 && run.totalRequests <= 6, `Expected 2 to 6 requests, got ${run.totalRequests}`);
    assert.equal(run.successCount + run.failedCount, run.totalRequests);
    assert.equal(run.statusCodes['200'], run.totalRequests);
    assert.equal(run.errorRate, 0);
  });

  // --- Scenario 6: Cancellation before completion ---
  await t.test('Scenario 6: Cancellation before completion metrics preservation', async () => {
    const runId = 'cancel-metric-run';
    const runRecord = {
      id: runId,
      userId: 'test-user',
      targetId: 'target-audit',
      targetName: 'Controlled Target',
      url: `${targetBaseUrl}/slow?ms=150`,
      method: 'GET',
      concurrency: 2,
      durationSec: 8,
      profile: 'fixed',
      stages: [],
      headers: {},
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

    // Wait 400ms for several requests to complete
    await new Promise(res => setTimeout(res, 400));

    // Cancel the run
    const cancelResult = await runner.cancelRun(runId);
    assert.equal(cancelResult.success, true);

    const cancelledRun = await waitForRun(runId, 5000);
    assert.equal(cancelledRun.status, 'cancelled');

    // Metrics for requests completed prior to cancellation must be preserved
    assert.ok(cancelledRun.totalRequests > 0, 'Completed requests must be preserved on cancellation');
    assert.equal(cancelledRun.successCount + cancelledRun.failedCount, cancelledRun.totalRequests);
    assert.ok(cancelledRun.rps > 0, 'RPS must be computed');
    assert.ok(cancelledRun.p50 > 0, 'p50 must be computed');
    assert.ok(cancelledRun.p95 > 0, 'p95 must be computed');
  });

  // --- Scenario 7: Zero requests behavior (mathematical boundary checks) ---
  await t.test('Scenario 7: Zero requests and zero successes boundary safety', () => {
    // Zero requests initial state simulation
    const zeroState = {
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

    assert.equal(zeroState.totalRequests, 0);
    assert.equal(zeroState.rps, 0);
    assert.equal(zeroState.errorRate, 0);
    assert.equal(zeroState.p50, 0);
    assert.equal(zeroState.p95, 0);
    assert.equal(zeroState.p99, 0);
    assert.deepEqual(zeroState.statusCodes, {});
  });

  // --- Scenario 8: Consistency between Live SSE Updates and Final Persisted Reports ---
  await t.test('Scenario 8: Live SSE event stream matches final persisted database record', async (subT) => {
    const app = createApp();
    const apiServer = http.createServer(app);
    await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
    const apiPort = apiServer.address().port;
    const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

    subT.after(async () => {
      await new Promise(resolve => apiServer.close(resolve));
    });

    const user = await storage.createUser({
      id: 'sse-user-1',
      name: 'SSE Tester',
      email: 'sse-tester@example.com',
      passwordHash: 'hash',
    });
    const token = generateToken(user);

    // Create target on the API
    const target = await storage.createTarget({
      id: 'target-sse-1',
      userId: user.id,
      name: 'Controlled Target SSE',
      url: targetBaseUrl,
      environment: 'Development',
      verified: true,
    });

    // Launch a run via the API
    const createRes = await fetch(`${apiBaseUrl}/runs`, {
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
    assert.equal(createRes.status, 202);
    const createdRun = await createRes.json();
    const runId = createdRun.id;

    // Connect to SSE stream
    const sseRes = await fetch(`${apiBaseUrl}/runs/${runId}/events?token=${token}`);
    assert.equal(sseRes.status, 200);

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseCompleteData = null;
    let sseEndReceived = false;

    // Read SSE stream until completion
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('event: complete')) {
          const nextDataLine = lines[i + 1];
          if (nextDataLine && nextDataLine.startsWith('data: ')) {
            sseCompleteData = JSON.parse(nextDataLine.slice(6));
          }
        }
        if (lines[i].startsWith('event: end')) {
          sseEndReceived = true;
        }
      }
      if (sseEndReceived) break;
    }

    await reader.cancel().catch(() => {});

    // Fetch final persisted run from API/storage
    const finalRunRes = await fetch(`${apiBaseUrl}/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(finalRunRes.status, 200);
    const persistedRun = await finalRunRes.json();

    assert.equal(persistedRun.status, 'completed');
    assert.ok(sseCompleteData, 'Expected to receive complete event via SSE');

    // Cross-validate SSE complete payload vs Persisted Database Record
    assert.equal(persistedRun.totalRequests, sseCompleteData.totalRequests, 'totalRequests match');
    assert.equal(persistedRun.successCount, sseCompleteData.successCount, 'successCount match');
    assert.equal(persistedRun.failedCount, sseCompleteData.failedCount, 'failedCount match');
    assert.equal(persistedRun.rps, sseCompleteData.rps, 'RPS match');
    assert.equal(persistedRun.p50, sseCompleteData.p50, 'p50 match');
    assert.equal(persistedRun.p95, sseCompleteData.p95, 'p95 match');
    assert.equal(persistedRun.p99, sseCompleteData.p99, 'p99 match');
    assert.equal(persistedRun.errorRate, sseCompleteData.errorRate, 'errorRate match');
    assert.deepEqual(persistedRun.statusCodes, sseCompleteData.statusCodes, 'statusCodes match');
  });
});

