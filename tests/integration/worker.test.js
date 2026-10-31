import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';

test('Worker: Controlled load-test execution and metrics collection', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-worker-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  let receivedRequests = 0;
  const mockTargetServer = http.createServer((req, res) => {
    receivedRequests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', count: receivedRequests }));
  });

  await new Promise(resolve => mockTargetServer.listen(0, '127.0.0.1', resolve));
  const targetPort = mockTargetServer.address().port;
  const targetUrl = `http://127.0.0.1:${targetPort}/test-endpoint`;

  t.after(async () => {
    await new Promise(resolve => mockTargetServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  const runner = new RunnerManager(storage);

  const runRecord = {
    id: 'test-run-1',
    userId: 'user-1',
    targetId: 'target-1',
    targetName: 'Mock Target',
    url: targetUrl,
    method: 'GET',
    concurrency: 3,
    durationSec: 2,
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

  // Poll storage until run reaches completed or failed
  let finalRun = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const r = await storage.getRunById('test-run-1');
    if (r && ['completed', 'failed', 'cancelled'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 200));
  }

  assert.ok(finalRun, 'Run did not finish in time');
  assert.equal(finalRun.status, 'completed');
  assert.ok(finalRun.totalRequests > 0, `Expected totalRequests > 0, got ${finalRun.totalRequests}`);
  assert.ok(finalRun.successCount > 0, `Expected successCount > 0, got ${finalRun.successCount}`);
  assert.ok(receivedRequests > 0, `Mock target server received no requests`);
  assert.ok(finalRun.statusCodes['200'] > 0, 'Expected 200 OK status code in results');
  assert.ok(finalRun.rps > 0, `Expected positive rps, got ${finalRun.rps}`);
  assert.ok(finalRun.p50 >= 0, `Expected calculated p50 latency`);
  assert.ok(finalRun.p95 >= 0, `Expected calculated p95 latency`);
  assert.ok(finalRun.p99 >= 0, `Expected calculated p99 latency`);
});

test('Worker: Safe cancellation of in-flight load test', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-cancel-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const mockTargetServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  await new Promise(resolve => mockTargetServer.listen(0, '127.0.0.1', resolve));
  const targetPort = mockTargetServer.address().port;
  const targetUrl = `http://127.0.0.1:${targetPort}/slow`;

  t.after(async () => {
    await new Promise(resolve => mockTargetServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  const runner = new RunnerManager(storage);

  const runRecord = {
    id: 'test-cancel-run',
    userId: 'user-2',
    targetId: 'target-2',
    targetName: 'Cancel Target',
    url: targetUrl,
    method: 'GET',
    concurrency: 2,
    durationSec: 10,
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

  // Wait 400ms for child process to spin up and start running
  await new Promise(res => setTimeout(res, 400));

  // Request cancellation
  const cancelResult = await runner.cancelRun('test-cancel-run');
  assert.equal(cancelResult.success, true);

  // Poll until finished
  let finalRun = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await storage.getRunById('test-cancel-run');
    if (r && ['cancelled', 'completed', 'failed'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 100));
  }

  assert.ok(finalRun);
  assert.equal(finalRun.status, 'cancelled');
});

test('Worker: Workload stages execution with custom method, headers and body', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-worker-stages-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  let receivedMethod = null;
  let receivedHeader = null;
  let receivedBody = '';
  let requestCount = 0;

  const mockTargetServer = http.createServer((req, res) => {
    receivedMethod = req.method;
    receivedHeader = req.headers['x-custom-test-header'];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = body;
      requestCount++;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ created: true }));
    });
  });

  await new Promise(resolve => mockTargetServer.listen(0, '127.0.0.1', resolve));
  const targetPort = mockTargetServer.address().port;
  const targetUrl = `http://127.0.0.1:${targetPort}/items`;

  t.after(async () => {
    await new Promise(resolve => mockTargetServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  const runner = new RunnerManager(storage);

  const runRecord = {
    id: 'test-stages-run-1',
    userId: 'user-stages',
    targetId: 'target-stages',
    targetName: 'Staged Target',
    url: targetUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Test-Header': 'DevFlowStageVal',
    },
    body: JSON.stringify({ item: 'widget', qty: 42 }),
    timeoutMs: 3000,
    profile: 'stages',
    stages: [
      { durationSec: 1, target: 2 },
      { durationSec: 1, target: 1 },
    ],
    concurrency: 2,
    durationSec: 2,
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

  // Capture progress events
  const capturedProgress = [];
  runner.events.on(`progress:${runRecord.id}`, (evt) => {
    capturedProgress.push(evt);
  });

  await runner.enqueueRun(runRecord);

  // Poll until finished
  let finalRun = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const r = await storage.getRunById(runRecord.id);
    if (r && ['completed', 'failed', 'cancelled'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 200));
  }

  assert.ok(finalRun, 'Staged run did not finish in time');
  assert.equal(finalRun.status, 'completed');
  assert.ok(requestCount > 0, 'Target server did not receive requests');
  assert.equal(receivedMethod, 'POST');
  assert.equal(receivedHeader, 'DevFlowStageVal');
  assert.ok(receivedBody.includes('widget'));
  assert.ok(finalRun.statusCodes['201'] > 0);
  assert.ok(capturedProgress.length > 0, 'Expected progress events emitted to runner manager');
});

