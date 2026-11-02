import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTestTargetServer, TARGET_CONFIG } from '../../tools/test-target.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { PgStorage } from '../../server/storage/postgres-storage.js';
import { RunnerManager, getRunnerManager } from '../../server/runner/manager.js';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { generateToken } from '../../server/security/auth.js';
import { config } from '../../server/config.js';

test('Failure Injection & Reliability: Complete fault matrix verification', async (t) => {
  // Helper: Poll until run reaches terminal state
  async function waitForTerminalRun(storage, runId, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await storage.getRunById(runId);
      if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
        return r;
      }
      await new Promise(res => setTimeout(res, 80));
    }
    throw new Error(`Run ${runId} did not reach terminal state within ${timeoutMs}ms`);
  }

  // =========================================================================
  // Scenario 1: Cancel an active run & verify no duplicate worker continues
  // =========================================================================
  await t.test('Scenario 1: Cancel active run terminates execution without rogue worker requests', async () => {
    let targetRequestsReceived = 0;
    const targetServer = http.createServer((req, res) => {
      targetRequestsReceived++;
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', count: targetRequestsReceived }));
      }, 80);
    });
    await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = targetServer.address().port;
    const targetUrl = `http://127.0.0.1:${targetPort}/slow`;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-cancel-test-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    const runner = new RunnerManager(storage);

    const runId = 'cancel-fi-run';
    const runRecord = {
      id: runId,
      userId: 'user-fi-1',
      targetId: 'target-fi-1',
      targetName: 'Controlled Target',
      url: targetUrl,
      method: 'GET',
      concurrency: 2,
      durationSec: 10,
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

    // Wait until worker spawns and target receives at least 1 request
    const startDeadline = Date.now() + 5000;
    while (targetRequestsReceived === 0 && Date.now() < startDeadline) {
      await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(targetRequestsReceived > 0, 'Target should have received initial requests');

    // Cancel the active run
    const cancelRes = await runner.cancelRun(runId);
    assert.equal(cancelRes.success, true);

    const cancelledRun = await waitForTerminalRun(storage, runId);
    assert.equal(cancelledRun.status, 'cancelled');
    assert.ok(cancelledRun.totalRequests > 0, 'Completed requests before cancellation must be preserved');

    // Snapshot request count right after cancellation
    const countAtCancel = targetRequestsReceived;

    // Wait 500ms and verify NO new requests arrive at the target (no rogue worker)
    await new Promise(r => setTimeout(r, 500));
    assert.equal(
      targetRequestsReceived,
      countAtCancel,
      `No additional requests should be received after cancellation (was ${countAtCancel}, now ${targetRequestsReceived})`
    );

    targetServer.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // =========================================================================
  // Scenario 2: Stop the target server during a run (Connection refused handling)
  // =========================================================================
  await t.test('Scenario 2: Abrupt target server shutdown during active run', async () => {
    let requestsBeforeShutdown = 0;
    const targetServer = http.createServer((req, res) => {
      requestsBeforeShutdown++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = targetServer.address().port;
    const targetUrl = `http://127.0.0.1:${targetPort}/shutdown-test`;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-shutdown-test-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    const runner = new RunnerManager(storage);

    const runId = 'shutdown-fi-run';
    const runRecord = {
      id: runId,
      userId: 'user-fi-1',
      targetId: 'target-fi-1',
      targetName: 'Controlled Target',
      url: targetUrl,
      method: 'GET',
      concurrency: 2,
      durationSec: 3,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 1500,
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

    // Let run execute for 300ms, then abruptly shut down the target
    await new Promise(r => setTimeout(r, 300));
    await new Promise(r => targetServer.close(r));

    // Wait for run to finish its 3-second cycle
    const finishedRun = await waitForTerminalRun(storage, runId, 6000);
    assert.equal(finishedRun.status, 'completed');
    assert.ok(finishedRun.totalRequests > 0);
    assert.ok(finishedRun.failedCount > 0, 'Requests after target shutdown must be counted as failed');
    assert.ok(finishedRun.statusCodes['network_error'] > 0, 'network_error status code bucket must record failed connections');
    assert.equal(finishedRun.successCount + finishedRun.failedCount, finishedRun.totalRequests);
    assert.ok(finishedRun.errorRate > 0, 'Error rate must reflect connection failures');

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // =========================================================================
  // Scenario 3: Bounded response delays and request timeouts
  // =========================================================================
  await t.test('Scenario 3: Response delays exceeding timeout trigger TimeoutError', async () => {
    // Target delays response by 600ms
    const targetServer = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ delayed: true }));
      }, 600);
    });
    await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = targetServer.address().port;
    const targetUrl = `http://127.0.0.1:${targetPort}/slow-timeout`;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-timeout-test-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    const runner = new RunnerManager(storage);

    const runId = 'timeout-fi-run';
    const runRecord = {
      id: runId,
      userId: 'user-fi-1',
      targetId: 'target-fi-1',
      targetName: 'Controlled Target',
      url: targetUrl,
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 150, // Timeout (150ms) < Server Delay (600ms)
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

    const finishedRun = await waitForTerminalRun(storage, runId, 5000);
    assert.equal(finishedRun.status, 'completed');
    assert.equal(finishedRun.successCount, 0, 'All requests should have timed out');
    assert.ok(finishedRun.failedCount > 0);
    assert.equal(finishedRun.statusCodes['timeout'], finishedRun.failedCount, 'All failed requests must be mapped to timeout');
    assert.equal(finishedRun.errorRate, 100, 'Error rate must be 100%');

    targetServer.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // =========================================================================
  // Scenario 4: Terminate a worker process during a run
  // =========================================================================
  await t.test('Scenario 4: Worker process abrupt termination transitions run to failed/cancelled', async () => {
    const targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = targetServer.address().port;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-worker-kill-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    const runner = new RunnerManager(storage);

    const runId = 'worker-kill-run';
    const runRecord = {
      id: runId,
      userId: 'user-fi-1',
      targetId: 'target-fi-1',
      targetName: 'Controlled Target',
      url: `http://127.0.0.1:${targetPort}/test`,
      method: 'GET',
      concurrency: 2,
      durationSec: 10,
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

    try {
      await storage.createRun(runRecord);
      await runner.enqueueRun(runRecord);

      // Wait for child process to spawn
      await new Promise(r => setTimeout(r, 400));
      const active = runner.activeRuns.get(runId);
      assert.ok(active, 'Active run must exist in runner');
      const childWorker = active.coordinator ? active.coordinator.workers[0]?.child : active.child;
      assert.ok(childWorker?.pid, 'Child worker process must be active');

      // Terminate worker abruptly with SIGTERM
      childWorker.kill('SIGTERM');

      const terminatedRun = await waitForTerminalRun(storage, runId, 4000);
      assert.ok(['cancelled', 'failed'].includes(terminatedRun.status));
      assert.ok(terminatedRun.finishedAt);
      assert.equal(runner.activeRuns.has(runId), false, 'Worker must be removed from activeRuns map');
    } finally {
      await new Promise(resolve => targetServer.close(resolve)).catch(() => {});
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // =========================================================================
  // Scenario 5: Disconnect the SSE client and reconnect
  // =========================================================================
  await t.test('Scenario 5: SSE client disconnect cleans up listeners without affecting runner or reconnecting client', async (subT) => {
    const targetServer = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, 50);
    });
    await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = targetServer.address().port;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-sse-reconnect-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    setStorage(storage);
    const runner = getRunnerManager(storage);

    const app = createApp();
    const apiServer = http.createServer(app);
    await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
    const apiPort = apiServer.address().port;
    const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

    subT.after(async () => {
      targetServer.close();
      await new Promise(r => apiServer.close(r));
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    const user = await storage.createUser({
      id: 'sse-fi-user',
      name: 'SSE FI User',
      email: 'sse-fi@example.com',
      passwordHash: 'hash',
    });
    const token = generateToken(user);

    const target = await storage.createTarget({
      id: 'target-sse-fi',
      userId: user.id,
      name: 'SSE FI Target',
      url: `http://127.0.0.1:${targetPort}`,
      environment: 'Development',
      verified: true,
    });

    const createRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetId: target.id,
        path: '/test',
        method: 'GET',
        concurrency: 2,
        durationSec: 2,
        authorized: true,
      }),
    });
    assert.equal(createRes.status, 202);
    const { id: runId } = await createRes.json();

    // 1. Connect Client 1 to SSE
    const sseRes1 = await fetch(`${apiBaseUrl}/runs/${runId}/events?token=${token}`);
    assert.equal(sseRes1.status, 200);
    const reader1 = sseRes1.body.getReader();

    // Read initial snapshot
    const firstChunk = await reader1.read();
    assert.ok(!firstChunk.done);

    // Count active listeners for runId
    const listenersBeforeDisconnect = runner.events.listenerCount(`progress:${runId}`);
    assert.ok(listenersBeforeDisconnect >= 1);

    // 2. Client 1 abruptly disconnects
    await reader1.cancel();

    // Wait for req.close handler to clean up listeners
    await new Promise(r => setTimeout(r, 200));
    const listenersAfterDisconnect = runner.events.listenerCount(`progress:${runId}`);
    assert.equal(listenersAfterDisconnect, 0, 'All listeners must be cleaned up on client disconnect');

    // 3. Client 2 reconnects to same run
    const sseRes2 = await fetch(`${apiBaseUrl}/runs/${runId}/events?token=${token}`);
    assert.equal(sseRes2.status, 200);
    const reader2 = sseRes2.body.getReader();
    const decoder = new TextDecoder();
    let receivedEnd = false;

    while (true) {
      const { value, done } = await reader2.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes('event: end') || text.includes('event: complete')) {
        receivedEnd = true;
        break;
      }
    }
    await reader2.cancel().catch(() => {});
    assert.ok(receivedEnd, 'Reconnected client must successfully receive complete/end event');
  });

  // =========================================================================
  // Scenario 6: Restart the backend during an active run
  // =========================================================================
  await t.test('Scenario 6: Backend restart invokes startupRecovery and updates orphaned runs', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-backend-restart-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();

    // Simulate active runs orphaned by a process crash / restart
    const queuedRun = await storage.createRun({
      id: 'orphaned-queued',
      userId: 'u1',
      targetId: 't1',
      targetName: 'Target 1',
      url: 'http://localhost:3000',
      method: 'GET',
      concurrency: 2,
      durationSec: 5,
      status: 'queued',
    });

    const runningRun = await storage.createRun({
      id: 'orphaned-running',
      userId: 'u1',
      targetId: 't1',
      targetName: 'Target 1',
      url: 'http://localhost:3000',
      method: 'GET',
      concurrency: 2,
      durationSec: 5,
      status: 'running',
    });

    const completedRun = await storage.createRun({
      id: 'stable-completed',
      userId: 'u1',
      targetId: 't1',
      targetName: 'Target 1',
      url: 'http://localhost:3000',
      method: 'GET',
      concurrency: 2,
      durationSec: 5,
      status: 'completed',
    });

    // Simulate backend startup sequence
    const newRunner = new RunnerManager(storage);
    await newRunner.startupRecovery();

    const q = await storage.getRunById('orphaned-queued');
    assert.equal(q.status, 'failed');
    assert.match(q.error, /Aborted due to unexpected server restart/);
    assert.ok(q.finishedAt);

    const r = await storage.getRunById('orphaned-running');
    assert.equal(r.status, 'failed');
    assert.match(r.error, /Aborted due to unexpected server restart/);
    assert.ok(r.finishedAt);

    const c = await storage.getRunById('stable-completed');
    assert.equal(c.status, 'completed', 'Completed runs must remain completed');

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // =========================================================================
  // Scenario 7: Simulate temporary PostgreSQL connection failure
  // =========================================================================
  await t.test('Scenario 7: PostgreSQL pool disconnection handles errors gracefully and keeps API responsive', async (subT) => {
    // If PostgreSQL URL is configured, run against real PG pool; otherwise simulate pool failure
    const pgUrl = config.databaseUrl || 'postgresql://postgres:postgres@127.0.0.1:5432/servertest';
    const pgStorage = new PgStorage(pgUrl);

    let pgConnected = false;
    try {
      await pgStorage.init();
      pgConnected = true;
    } catch {
      // If Postgres is not running locally, skip real pool init and test graceful error handling
    }

    if (pgConnected) {
      subT.after(async () => {
        await pgStorage.close().catch(() => {});
      });

      // 1. Simulate pool connection termination
      await pgStorage.pool.end();

      // 2. Attempt query against terminated pool
      await assert.rejects(
        async () => {
          await pgStorage.getRunById('any-run-id');
        },
        (err) => {
          assert.match(err.message, /call(ed|ing) end on (the )?pool|closed|client was closed/i);
          return true;
        }
      );

      // 3. Re-instantiate healthy storage pool to verify reconnection recovery
      const restoredStorage = new PgStorage(pgUrl);
      await restoredStorage.init();
      const healthyRuns = await restoredStorage.getRuns('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      assert.ok(Array.isArray(healthyRuns));
      await restoredStorage.close();
    } else {
      // In standalone mode: verify that invalid PG connection URL rejects cleanly without process crash
      const invalidStorage = new PgStorage('postgresql://invalid_user:invalid_pass@127.0.0.1:9999/nonexistent');
      await assert.rejects(
        async () => {
          await invalidStorage.init();
        },
        (err) => {
          assert.ok(err);
          return true;
        }
      );
    }
  });

  // =========================================================================
  // Scenario 8: Historical reports consistency and secrets non-exposure
  // =========================================================================
  await t.test('Scenario 8: Historical reports retrieval preserves metrics and redacts sensitive headers', async (subT) => {
    const app = createApp();
    const apiServer = http.createServer(app);
    await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
    const apiPort = apiServer.address().port;
    const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fail-secrets-report-'));
    const storage = new JsonStorage(tmpDir);
    await storage.init();
    setStorage(storage);

    subT.after(async () => {
      await new Promise(r => apiServer.close(r));
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    const user = await storage.createUser({
      id: 'report-user-1',
      name: 'Report User',
      email: 'report@example.com',
      passwordHash: 'hash',
    });
    const token = generateToken(user);

    const target = await storage.createTarget({
      id: 'target-report-1',
      userId: user.id,
      name: 'Report Target',
      url: 'http://127.0.0.1:5050',
      environment: 'Development',
      verified: true,
    });

    // Create a run containing sensitive headers
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
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        headers: {
          'Authorization': 'Bearer secret-jwt-token-12345',
          'X-Api-Key': 'secret-production-key-99999',
          'Cookie': 'sessionId=secret-session-cookie-abc',
          'Accept': 'application/json',
        },
      }),
    });
    assert.equal(createRes.status, 202);
    const { id: runId } = await createRes.json();

    // Fetch the run report via GET /api/runs/:id
    const reportRes = await fetch(`${apiBaseUrl}/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(reportRes.status, 200);
    const report = await reportRes.json();

    // Verify secrets are redacted in stored/retrieved run
    assert.equal(report.headers['Authorization'], '[REDACTED]', 'Authorization header must be redacted');
    assert.equal(report.headers['X-Api-Key'], '[REDACTED]', 'X-Api-Key header must be redacted');
    assert.equal(report.headers['Cookie'], '[REDACTED]', 'Cookie header must be redacted');
    assert.equal(report.headers['Accept'], 'application/json', 'Safe headers must be preserved');

    // Confirm that the secret values do NOT appear anywhere in the serialized report JSON
    const reportStr = JSON.stringify(report);
    assert.equal(reportStr.includes('secret-jwt-token-12345'), false);
    assert.equal(reportStr.includes('secret-production-key-99999'), false);
    assert.equal(reportStr.includes('secret-session-cookie-abc'), false);
  });
});
