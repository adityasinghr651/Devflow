import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';

test('Coordinator: 1-worker backward-compatible execution', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-coord-1w-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  let receivedRequests = 0;
  const mockServer = http.createServer((req, res) => {
    receivedRequests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: receivedRequests }));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const targetUrl = `http://127.0.0.1:${port}/test`;
  let runner;

  t.after(async () => {
    await runner?.shutdown(3000);
    await storage.close();
    await new Promise(resolve => mockServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  runner = new RunnerManager(storage);

  const runRecord = {
    id: 'coord-run-1w',
    userId: 'user-1',
    targetId: 'target-1',
    targetName: 'Mock Target 1W',
    url: targetUrl,
    method: 'GET',
    concurrency: 2,
    durationSec: 2,
    workerCount: 1,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
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

  const deadline = Date.now() + 8000;
  let finalRun = null;
  while (Date.now() < deadline) {
    const r = await storage.getRunById('coord-run-1w');
    if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 150));
  }

  assert.ok(finalRun, 'Run did not finish within deadline');
  assert.equal(finalRun.status, 'completed');
  assert.ok(finalRun.totalRequests > 0);
  assert.equal(finalRun.successCount, finalRun.totalRequests);
  assert.equal(finalRun.statusCodes['200'], finalRun.totalRequests);
  assert.ok(finalRun.rps > 0);
  assert.ok(finalRun.p50 >= 0);
  assert.ok(finalRun.p95 >= 0);
  assert.ok(finalRun.p99 >= 0);
});

test('Coordinator: 2-worker distributed execution with unified metrics', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-coord-2w-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  let receivedRequests = 0;
  const mockServer = http.createServer((req, res) => {
    receivedRequests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: receivedRequests }));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const targetUrl = `http://127.0.0.1:${port}/distributed`;
  let runner;

  t.after(async () => {
    await runner?.shutdown(3000);
    await storage.close();
    await new Promise(resolve => mockServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  runner = new RunnerManager(storage);

  const runRecord = {
    id: 'coord-run-2w',
    userId: 'user-1',
    targetId: 'target-1',
    targetName: 'Mock Target 2W',
    url: targetUrl,
    method: 'GET',
    concurrency: 4, // 4 total concurrency partitioned as 2 + 2 across 2 workers
    durationSec: 2,
    workerCount: 2,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
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

  // Capture live progress events emitted by runner
  const progressSnapshots = [];
  runner.events.on(`progress:${runRecord.id}`, (data) => {
    progressSnapshots.push(data);
  });

  await runner.enqueueRun(runRecord);

  const deadline = Date.now() + 8000;
  let finalRun = null;
  while (Date.now() < deadline) {
    const r = await storage.getRunById('coord-run-2w');
    if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 150));
  }

  assert.ok(finalRun, '2-worker run did not finish within deadline');
  assert.equal(finalRun.status, 'completed');
  assert.ok(finalRun.totalRequests > 0, `Expected totalRequests > 0, got ${finalRun.totalRequests}`);
  assert.equal(finalRun.successCount, finalRun.totalRequests);
  assert.equal(finalRun.failedCount, 0);
  assert.equal(finalRun.statusCodes['200'], finalRun.totalRequests);
  assert.ok(finalRun.rps > 0);
  assert.ok(finalRun.p50 >= 0);
  assert.ok(finalRun.p95 >= 0);
  assert.ok(finalRun.p99 >= 0);
  assert.ok(progressSnapshots.length > 0, 'Expected live progress events emitted');
});

test('Coordinator: Cancellation across multiple workers', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-coord-cancel-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const mockServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const targetUrl = `http://127.0.0.1:${port}/cancel-test`;
  let runner;

  t.after(async () => {
    await runner?.shutdown(3000);
    await storage.close();
    await new Promise(resolve => mockServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  runner = new RunnerManager(storage);

  const runRecord = {
    id: 'coord-run-cancel',
    userId: 'user-1',
    targetId: 'target-1',
    targetName: 'Cancel Target',
    url: targetUrl,
    method: 'GET',
    concurrency: 4,
    durationSec: 10, // Long duration so we cancel midway
    workerCount: 2,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
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

  // Wait 400ms for child processes to launch and begin sending requests
  await new Promise(res => setTimeout(res, 400));

  // Request cancellation
  const cancelRes = await runner.cancelRun(runRecord.id);
  assert.equal(cancelRes.success, true);

  const deadline = Date.now() + 5000;
  let finalRun = null;
  while (Date.now() < deadline) {
    const r = await storage.getRunById(runRecord.id);
    if (r && ['cancelled', 'completed', 'failed'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 100));
  }

  assert.ok(finalRun);
  assert.equal(finalRun.status, 'cancelled');
  // Metrics recorded before cancellation should be preserved
  assert.ok(finalRun.totalRequests >= 0);
});

test('Coordinator: Worker failure stops siblings and fails run safely', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-coord-fail-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  let runner;

  t.after(async () => {
    await runner?.shutdown(3000);
    await storage.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  runner = new RunnerManager(storage);

  // Point to a non-existent port to trigger connection error on execution
  const runRecord = {
    id: 'coord-run-fail',
    userId: 'user-1',
    targetId: 'target-1',
    targetName: 'Fail Target',
    url: 'http://127.0.0.1:59999/does-not-exist',
    method: 'GET',
    concurrency: 2,
    durationSec: 2,
    workerCount: 2,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
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

  const deadline = Date.now() + 8000;
  let finalRun = null;
  while (Date.now() < deadline) {
    const r = await storage.getRunById(runRecord.id);
    if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 150));
  }

  assert.ok(finalRun);
  // Either completed with 100% network errors or failed
  assert.ok(['completed', 'failed'].includes(finalRun.status));
  if (finalRun.status === 'completed') {
    assert.equal(finalRun.errorRate, 100);
    assert.equal(finalRun.successCount, 0);
  }
});

