import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';
import { createTestTargetServer, TARGET_CONFIG } from '../../tools/test-target.js';

async function fixture(t) {
  process.env.RUNNER_ENGINE = 'node';
  const server = createTestTargetServer();
  await new Promise(resolve => server.listen(0, TARGET_CONFIG.host, resolve));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-validation-'));
  const storage = new JsonStorage(tempDir);
  await storage.init();
  const runner = new RunnerManager(storage);
  const baseUrl = `http://${TARGET_CONFIG.host}:${server.address().port}`;
  t.after(async () => {
    for (const run of await storage.getRuns()) {
      if (['queued', 'validating', 'running', 'cancelling'].includes(run.status)) await runner.cancelRun(run.id).catch(() => {});
    }
    await runner.shutdown(3000);
    await storage.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  return { server, storage, runner, baseUrl };
}

async function startRun(storage, runner, baseUrl, { path: endpoint = '/health', durationSec = 1, concurrency = 4, workerCount = 1, timeoutMs = 1000, assertions } = {}) {
  const run = {
    id: randomUUID(), userId: 'validation', targetId: 'loopback', targetName: 'Validation target',
    url: `${baseUrl}${endpoint}`, method: 'GET', concurrency, durationSec, profile: 'fixed', stages: [],
    headers: {}, body: null, timeoutMs, workerCount, assertions, authorized: true,
    status: 'queued', startedAt: new Date().toISOString(), totalRequests: 0, successCount: 0,
    failedCount: 0, rps: 0, p50: 0, p95: 0, p99: 0, errorRate: 0, statusCodes: {},
  };
  await storage.createRun(run);
  await runner.enqueueRun(run);
  return run;
}

async function waitForTerminal(storage, run, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await storage.getRunById(run.id);
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(current?.status)) return current;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`run ${run.id} did not finish before validation timeout`);
}

function assertCounts(run) {
  assert.equal(run.successCount + run.failedCount, run.totalRequests);
  assert.equal(Object.values(run.statusCodes).reduce((sum, count) => sum + count, 0), run.totalRequests + (run.cancelledCount || 0));
  assert.equal(run.errorRate, run.totalRequests ? Number((run.failedCount / run.totalRequests * 100).toFixed(4)) : 0);
}

test('V1 fast API totals, status counts, rate and metadata are consistent', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  const run = await startRun(storage, runner, baseUrl, { path: '/fixed?delayMs=0' });
  const result = await waitForTerminal(storage, run);
  assert.equal(result.status, 'completed');
  assert.ok(result.totalRequests > 0);
  assert.ok(result.rps > 1, `expected RPS > 1, got ${result.rps}`);
  assertCounts(result);
  assert.equal(result.statusCodes['200'], result.totalRequests);
  assert.equal(result.environmentMetadata.engine, 'node');
  assert.equal(result.environmentMetadata.workerCount, 1);
});

test('V2 50ms API latency and throughput are within measured-tolerance range', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  const run = await startRun(storage, runner, baseUrl, { path: '/fixed?delayMs=50' });
  const result = await waitForTerminal(storage, run);
  assert.equal(result.status, 'completed');
  const reportNames = (await fs.readdir(path.resolve('benchmarks/results'))).filter(name => name.startsWith('variance-study-') && name.endsWith('.json')).sort();
  assert.ok(reportNames.length > 0, 'run tools/variance-study.js before measuring timing tolerance');
  const variance = JSON.parse(await fs.readFile(path.resolve('benchmarks/results', reportNames.at(-1)), 'utf8')).byWorkerCount['1'];
  const latencyTolerance = Math.max(1, 3 * variance.p50.standardDeviation);
  // Five measured standard deviations allow occasional local CPU scheduling noise while
  // still bounding throughput tightly around the controlled target's empirical baseline.
  const rpsTolerance = 5 * variance.rps.standardDeviation;
  assert.ok(Math.abs(result.p50 - variance.p50.mean) <= latencyTolerance, `p50=${result.p50}ms outside measured ${variance.p50.mean} +/- ${latencyTolerance}ms`);
  assert.ok(Math.abs(result.rps - variance.rps.mean) <= rpsTolerance, `RPS=${result.rps} outside measured ${variance.rps.mean} +/- ${rpsTolerance}`);
  const littleLawRps = 4 / (result.p50 / 1000);
  assert.ok(Math.abs(result.rps - littleLawRps) / littleLawRps <= 0.08, `RPS=${result.rps} not close to 4 / ${result.p50}ms Little's-law estimate ${littleLawRps.toFixed(2)}`);
});

test('V3 deterministic every-fifth failure has exact failed count and error rate', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  await fetch(`${baseUrl}/__reset`, { method: 'POST' });
  const run = await startRun(storage, runner, baseUrl, { path: '/flaky?everyN=5&status=503' });
  const result = await waitForTerminal(storage, run);
  assert.equal(result.status, 'completed');
  assert.equal(result.httpErrorCount, Math.floor(result.totalRequests / 5));
  assert.equal(result.failedCount, result.httpErrorCount);
  assert.equal(result.statusCodes['503'], result.httpErrorCount);
  assertCounts(result);
});

test('V4 hanging endpoint records timeouts and completes with correct categories', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  const run = await startRun(storage, runner, baseUrl, { path: '/hang', timeoutMs: 100 });
  const result = await waitForTerminal(storage, run);
  assert.equal(result.status, 'completed');
  assert.ok(result.timeoutCount > 0);
  assert.equal(result.failedCount, result.timeoutCount);
  assertCounts(result);
});

test('V5 cancellation across 1, 2 and 4 workers excludes cancelled work and reaps children', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  for (const workerCount of [1, 2, 4]) {
    const run = await startRun(storage, runner, baseUrl, { path: '/fixed?delayMs=300', durationSec: 4, workerCount });
    const activeDeadline = Date.now() + 3000;
    while (!runner.activeRuns.get(run.id)?.coordinator && Date.now() < activeDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    const pids = runner.activeRuns.get(run.id)?.coordinator?.getWorkerPids() || [];
    assert.equal(pids.length, workerCount);
    await new Promise(resolve => setTimeout(resolve, 120));
    await runner.cancelRun(run.id);
    const result = await waitForTerminal(storage, run);
    assert.equal(result.status, 'cancelled');
    assert.ok(result.cancelledCount > 0);
    assert.equal(result.totalRequests, result.successCount + result.failedCount);
    assert.equal(result.failedCount, result.httpErrorCount + result.timeoutCount + result.networkErrorCount + result.redirectBlockedCount + result.assertionFailureCount);
    for (const pid of pids) {
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH', `worker pid ${pid} remained alive after cancellation`);
    }
  }
});

test('V6 1, 2 and 4 worker aggregates remain internally consistent', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  for (const workerCount of [1, 2, 4]) {
    const run = await startRun(storage, runner, baseUrl, { path: '/fixed?delayMs=10', workerCount });
    const result = await waitForTerminal(storage, run);
    assert.equal(result.status, 'completed');
    assertCounts(result);
    assert.equal(result.statusCodes['200'], result.totalRequests);
    assert.equal(result.environmentMetadata.workerCount, workerCount);
  }
});

test('T1.3 GraphQL errors in HTTP 200 responses fail safe response assertions', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  await fetch(`${baseUrl}/__reset`, { method: 'POST' });
  const run = await startRun(storage, runner, baseUrl, {
    path: '/graphql-errors?everyN=1',
    assertions: { status: 200, jsonPath: [{ path: 'errors', op: 'notExists' }] },
  });
  const result = await waitForTerminal(storage, run);
  assert.equal(result.status, 'completed');
  assert.ok(result.totalRequests > 0);
  assert.equal(result.assertionFailureCount, result.totalRequests);
  assert.equal(result.httpErrorCount, 0);
  assert.equal(result.failedCount, result.assertionFailureCount);
  assert.equal(result.successCount, 0);
  assertCounts(result);
});

test('T1.3 exact status and JSON value assertions can pass, oversized bodies fail within the read cap', async t => {
  const { storage, runner, baseUrl } = await fixture(t);
  const expected404 = await startRun(storage, runner, baseUrl, {
    path: '/status/404', assertions: { status: 404, jsonPath: [{ path: 'statusCode', op: 'equals', equals: 404 }] },
  });
  const passed = await waitForTerminal(storage, expected404);
  assert.equal(passed.status, 'completed');
  assert.ok(passed.successCount > 0);
  assert.equal(passed.httpErrorCount, 0);
  assert.equal(passed.assertionFailureCount, 0);

  const oversized = await startRun(storage, runner, baseUrl, {
    path: '/big?bytes=65537', assertions: { bodyContains: 'x' },
  });
  const rejectedBody = await waitForTerminal(storage, oversized);
  assert.equal(rejectedBody.status, 'completed');
  assert.ok(rejectedBody.totalRequests > 0);
  assert.equal(rejectedBody.assertionFailureCount, rejectedBody.totalRequests);
  assert.equal(rejectedBody.failedCount, rejectedBody.assertionFailureCount);
});
