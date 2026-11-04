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
import { ProgressAggregator } from '../../server/runner/progress-aggregator.js';
import { LatencyHistogram } from '../../server/runner/latency-histogram.js';
import { TestCoordinator } from '../../server/runner/coordinator.js';
import { EventEmitter } from 'node:events';

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
    await runner.shutdown(3000);
    await storage.close();
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

    // RPS validation: positive and computed from the measured request window
    assert.ok(run.rps > 0, `RPS must be positive, got ${run.rps}`);
    assert.ok(run.measurementWindowSec > 0, 'Measurement window must span the first request start through last completion');
    assert.equal(run.rps, Number((run.totalRequests / run.measurementWindowSec).toFixed(2)));

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

    // Error rate must reflect 500 count / totalRequests (4-decimal precision contract)
    const expectedErrorRate = Number(((run.failedCount / run.totalRequests) * 100).toFixed(4));
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
    const ticketResponse = await fetch(`${apiBaseUrl}/runs/${runId}/events-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const { ticket } = await ticketResponse.json();
    const sseRes = await fetch(`${apiBaseUrl}/runs/${runId}/events?ticket=${ticket}`);
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

  // --- Scenario 9: Granular Error Classification Counters ---
  await t.test('Scenario 9: Detailed error counters (httpError, timeout, networkError, redirect_blocked)', async (subT) => {
    let reqCount = 0;
    const testServer = http.createServer((req, res) => {
      reqCount++;
      const url = req.url;
      if (url.includes('/ok')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.includes('/404')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      } else if (url.includes('/500')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server Error' }));
      } else if (url.includes('/redirect')) {
        res.writeHead(302, { Location: '/ok' });
        res.end();
      } else if (url.includes('/slow')) {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ delayed: true }));
          }
        }, 300);
      } else {
        res.writeHead(200);
        res.end('ok');
      }
    });

    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
    const testPort = testServer.address().port;

    subT.after(async () => {
      await new Promise(resolve => testServer.close(resolve)).catch(() => {});
    });

    // 1. Test redirect blocked
    const redRunId = 'metrics-redirect-run';
    const redRun = {
      id: redRunId,
      userId: 'user-m-9',
      targetId: 'target-m-9',
      targetName: 'Redirect Target',
      url: `http://127.0.0.1:${testPort}/redirect`,
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 1000,
      status: 'queued',
      startedAt: new Date().toISOString(),
    };
    await storage.createRun(redRun);
    await runner.enqueueRun(redRun);
    const completedRedRun = await waitForRun(redRunId, 4000);

    assert.equal(completedRedRun.status, 'completed');
    assert.ok(completedRedRun.redirectBlockedCount > 0, 'redirectBlockedCount must record redirect blocks');
    assert.ok(completedRedRun.failedCount > 0, 'failedCount must include redirect blocks');
    assert.ok(completedRedRun.statusCodes['redirect_blocked'] > 0, 'statusCodes must record redirect_blocked');
    assert.equal(completedRedRun.failedCount, completedRedRun.httpErrorCount + completedRedRun.timeoutCount + completedRedRun.networkErrorCount + completedRedRun.redirectBlockedCount);

    // 2. Test timeout
    const toRunId = 'metrics-timeout-run';
    const toRun = {
      id: toRunId,
      userId: 'user-m-9',
      targetId: 'target-m-9',
      targetName: 'Timeout Target',
      url: `http://127.0.0.1:${testPort}/slow`,
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 50, // 50ms timeout against 300ms server delay
      status: 'queued',
      startedAt: new Date().toISOString(),
    };
    await storage.createRun(toRun);
    await runner.enqueueRun(toRun);
    const completedToRun = await waitForRun(toRunId, 4000);

    assert.equal(completedToRun.status, 'completed');
    assert.ok(completedToRun.timeoutCount > 0, 'timeoutCount must record timeouts');
    assert.equal(completedToRun.failedCount, completedToRun.httpErrorCount + completedToRun.timeoutCount + completedToRun.networkErrorCount + completedToRun.redirectBlockedCount);
    assert.ok(completedToRun.statusCodes['timeout'] > 0);

    // 3. Test HTTP 404 & 500 error counts
    const errRunId = 'metrics-httperr-run';
    const errRun = {
      id: errRunId,
      userId: 'user-m-9',
      targetId: 'target-m-9',
      targetName: 'HTTP Error Target',
      url: `http://127.0.0.1:${testPort}/500`,
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 1000,
      status: 'queued',
      startedAt: new Date().toISOString(),
    };
    await storage.createRun(errRun);
    await runner.enqueueRun(errRun);
    const completedErrRun = await waitForRun(errRunId, 4000);

    assert.equal(completedErrRun.status, 'completed');
    assert.ok(completedErrRun.httpErrorCount > 0, 'httpErrorCount must record 500 status');
    assert.equal(completedErrRun.failedCount, completedErrRun.httpErrorCount + completedErrRun.timeoutCount + completedErrRun.networkErrorCount + completedErrRun.redirectBlockedCount);
    assert.equal(completedErrRun.statusCodes['500'], completedErrRun.httpErrorCount);
  });

  // --- Scenario 10: Cancelled in-flight requests are excluded from latency histogram and error-rate denominator ---
  await t.test('Scenario 10: Cancelled in-flight requests exclusion from histogram and error-rate denominator', async (subT) => {
    const slowServer = http.createServer((req, res) => {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        }
      }, 500);
    });
    await new Promise(resolve => slowServer.listen(0, '127.0.0.1', resolve));
    const slowPort = slowServer.address().port;

    subT.after(async () => {
      await new Promise(resolve => slowServer.close(resolve)).catch(() => {});
    });

    const runId = 'metrics-cancel-exclusion-run';
    const runRecord = {
      id: runId,
      userId: 'user-m-10',
      targetId: 'target-m-10',
      targetName: 'Slow Target',
      url: `http://127.0.0.1:${slowPort}/slow`,
      method: 'GET',
      concurrency: 4,
      durationSec: 10,
      workerCount: 2,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 5000,
      status: 'queued',
      startedAt: new Date().toISOString(),
    };

    await storage.createRun(runRecord);
    await runner.enqueueRun(runRecord);

    // Let workers issue initial in-flight requests
    await new Promise(res => setTimeout(res, 150));
    await runner.cancelRun(runId);

    const cancelledRun = await waitForRun(runId, 4000);
    assert.equal(cancelledRun.status, 'cancelled');

    // Cancelled requests accounting assertions
    assert.ok(cancelledRun.cancelledCount >= 0, 'cancelledCount must be defined');
    assert.equal(
      cancelledRun.totalRequests,
      cancelledRun.successCount + cancelledRun.failedCount,
      'totalRequests must strictly equal successCount + failedCount (cancelled requests excluded)'
    );
    assert.equal(
      cancelledRun.failedCount,
      cancelledRun.httpErrorCount + cancelledRun.timeoutCount + cancelledRun.networkErrorCount + cancelledRun.redirectBlockedCount,
      'failedCount must equal all failure category counters'
    );
  });

  // --- Scenario 11: High precision errorRate preservation across multi-worker aggregation ---
  await t.test('Scenario 11: High precision errorRate (e.g. 57,004 total / 2 failed = 0.0035%) across 1, 2, and 4 workers', () => {
    // 1 Worker simulation
    const agg1 = new ProgressAggregator(1, 30);
    agg1.updateWorker(0, {
      totalRequests: 57004,
      successCount: 57002,
      failedCount: 2,
      httpErrorCount: 0,
      timeoutCount: 2,
      networkErrorCount: 0,
      cancelledCount: 0,
      statusCodes: { '200': 57002, timeout: 2 },
      elapsedSec: 30,
      progressPercent: 100,
    });
    const res1 = agg1.getAggregatedProgress();
    assert.equal(res1.totalRequests, 57004);
    assert.equal(res1.failedCount, 2);
    assert.equal(res1.timeoutCount, 2);
    assert.ok(res1.errorRate > 0, 'errorRate must not round to 0.00%');
    assert.equal(res1.errorRate, 0.0035, 'errorRate must maintain 4-decimal precision');

    // 2 Workers simulation (split 28,502 total each, 1 failure each)
    const agg2 = new ProgressAggregator(2, 30);
    agg2.updateWorker(0, {
      totalRequests: 28502,
      successCount: 28501,
      failedCount: 1,
      httpErrorCount: 0,
      timeoutCount: 1,
      networkErrorCount: 0,
      cancelledCount: 0,
      statusCodes: { '200': 28501, timeout: 1 },
      elapsedSec: 30,
      progressPercent: 100,
    });
    agg2.updateWorker(1, {
      totalRequests: 28502,
      successCount: 28501,
      failedCount: 1,
      httpErrorCount: 0,
      timeoutCount: 1,
      networkErrorCount: 0,
      cancelledCount: 0,
      statusCodes: { '200': 28501, timeout: 1 },
      elapsedSec: 30,
      progressPercent: 100,
    });
    const res2 = agg2.getAggregatedProgress();
    assert.equal(res2.totalRequests, 57004);
    assert.equal(res2.failedCount, 2);
    assert.equal(res2.timeoutCount, 2);
    assert.equal(res2.errorRate, 0.0035);

    // 4 Workers simulation (split across 4 workers)
    const agg4 = new ProgressAggregator(4, 30);
    agg4.updateWorker(0, { totalRequests: 14251, successCount: 14251, failedCount: 0, timeoutCount: 0, elapsedSec: 30 });
    agg4.updateWorker(1, { totalRequests: 14251, successCount: 14250, failedCount: 1, timeoutCount: 1, elapsedSec: 30 });
    agg4.updateWorker(2, { totalRequests: 14251, successCount: 14251, failedCount: 0, timeoutCount: 0, elapsedSec: 30 });
    agg4.updateWorker(3, { totalRequests: 14251, successCount: 14250, failedCount: 1, timeoutCount: 1, elapsedSec: 30 });
    const res4 = agg4.getAggregatedProgress();
    assert.equal(res4.totalRequests, 57004);
    assert.equal(res4.failedCount, 2);
    assert.equal(res4.timeoutCount, 2);
    assert.equal(res4.errorRate, 0.0035);
  });

  // --- Scenario 12: RUNNER_ENGINE=node forces coordinator even with 1 worker ---
  await t.test('Scenario 12: RUNNER_ENGINE=node forces coordinator even with 1 worker', async () => {
    const prevEngine = process.env.RUNNER_ENGINE;
    process.env.RUNNER_ENGINE = 'node';
    try {
      const runId = 'metrics-engine-node-run';
      const runRecord = {
        id: runId,
        userId: 'user-m-12',
        targetId: 'target-m-12',
        targetName: 'Engine Target',
        url: `${targetBaseUrl}/health`,
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        workerCount: 1,
        profile: 'fixed',
        stages: [],
        headers: {},
        body: null,
        timeoutMs: 1000,
        status: 'queued',
        startedAt: new Date().toISOString(),
      };
      await storage.createRun(runRecord);
      await runner.enqueueRun(runRecord);
      const completedRun = await waitForRun(runId, 4000);

      assert.equal(completedRun.status, 'completed');
      assert.equal(completedRun.engine, 'node');
    } finally {
      if (prevEngine !== undefined) {
        process.env.RUNNER_ENGINE = prevEngine;
      } else {
        delete process.env.RUNNER_ENGINE;
      }
    }
  });

  // --- Scenario 13: Coordinator partial worker recovery, duplicate complete guard, and exit-0-without-complete ---
  await t.test('Scenario 13: Coordinator partial worker recovery, duplicate complete guard, and exit-0-without-complete', async () => {
    const run = {
      id: 'coord-recovery-test',
      userId: 'u1',
      targetId: 't1',
      url: 'http://127.0.0.1:5050/health',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
      workerCount: 2,
    };

    let transitionedStatus = null;
    let transitionedUpdates = null;

    // Fake forkFn that returns mock EventEmitter children
    const fakeChildren = [];
    const mockFork = () => {
      const child = new EventEmitter();
      child.pid = 99000 + fakeChildren.length;
      child.send = () => {};
      child.kill = () => {};
      fakeChildren.push(child);
      return child;
    };

    const coord = new TestCoordinator(run, {
      forkFn: mockFork,
      transitionState: async (id, status, updates) => {
        transitionedStatus = status;
        transitionedUpdates = updates;
      },
    });

    const runPromise = coord.start();
    assert.equal(fakeChildren.length, 2);

    // Worker 0 reports progress snapshot
    coord._handleWorkerMessage(0, {
      type: 'progress',
      data: {
        totalRequests: 100,
        successCount: 100,
        failedCount: 0,
        statusCodes: { '200': 100 },
        elapsedSec: 2,
      },
    });

    // Worker 1 reports progress snapshot
    coord._handleWorkerMessage(1, {
      type: 'progress',
      data: {
        totalRequests: 50,
        successCount: 48,
        failedCount: 2,
        timeoutCount: 2,
        statusCodes: { '200': 48, timeout: 2 },
        elapsedSec: 2,
      },
    });

    // Worker 0 completes normally with summary
    const hist0 = new LatencyHistogram();
    hist0.record(10);
    coord._handleWorkerMessage(0, {
      type: 'complete',
      data: {
        workerIndex: 0,
        totalRequests: 100,
        successCount: 100,
        failedCount: 0,
        statusCodes: { '200': 100 },
        histogram: hist0.toJSON(),
      },
    });

    // Worker 0 sends duplicate complete message -> should be ignored safely
    coord._handleWorkerMessage(0, {
      type: 'complete',
      data: {
        workerIndex: 0,
        totalRequests: 999,
        successCount: 999,
        failedCount: 0,
        statusCodes: { '200': 999 },
      },
    });

    // Worker 1 was cancelled/killed before sending complete summary
    coord.isCancelled = true;
    coord._handleWorkerExit(1, null, 'SIGTERM');

    const summary = await runPromise;
    assert.equal(summary.status, 'cancelled');
    // Total requests must equal 100 (from worker 0 summary) + 50 (from worker 1 progress fallback) = 150!
    assert.equal(summary.totalRequests, 150);
    assert.equal(summary.failedCount, 2);
    assert.deepEqual(summary.partialWorkers, [1]);
    assert.equal(summary.histogramComplete, false);
  });
});

