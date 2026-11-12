import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { setStorage } from '../../server/storage/index.js';
import { getRunnerManager } from '../../server/runner/manager.js';
import { createTestPassword } from '../helpers/test-credentials.js';

test('Cancellation Test Matrix: Multi-worker lifecycle and cleanup audit', async (t) => {
  // 1. Controlled Local HTTP Target
  const targetServer = http.createServer((req, res) => {
    // 30ms artificial latency so in-flight requests exist
    setTimeout(() => {
      if (!res.writableEnded) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    }, 30);
  });
  await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
  const targetPort = targetServer.address().port;
  const targetUrl = `http://127.0.0.1:${targetPort}/test`;

  // 2. Storage & App Setup
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cancel-matrix-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const runner = getRunnerManager(storage);
  const app = createApp();
  const apiServer = http.createServer(app);
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const apiPort = apiServer.address().port;
  const apiBase = `http://127.0.0.1:${apiPort}/api`;
  const passwordA = createTestPassword();
  const passwordB = createTestPassword();

  t.after(async () => {
    await new Promise(resolve => apiServer.close(resolve)).catch(() => {});
    await runner.shutdown(3000);
    await storage.close();
    await new Promise(resolve => targetServer.close(resolve)).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // 3. User Setup
  const userARes = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User A', email: 'userA@example.com', password: passwordA }),
  });
  const { token: tokenA, user: userA } = await userARes.json();

  const userBRes = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User B', email: 'userB@example.com', password: passwordB }),
  });
  const { token: tokenB } = await userBRes.json();

  // Create Target for User A
  const targetRes = await fetch(`${apiBase}/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: 'Cancel Target', url: targetUrl, environment: 'Development' }),
  });
  const targetDoc = await targetRes.json();

  // Helper to wait for terminal status
  async function waitForTerminal(runId, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${apiBase}/runs/${runId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (res.ok) {
        const doc = await res.json();
        if (['completed', 'cancelled', 'failed', 'timed_out'].includes(doc.status)) {
          return doc;
        }
      }
      await new Promise(r => setTimeout(r, 60));
    }
    throw new Error(`Run ${runId} did not reach terminal state within ${timeoutMs}ms`);
  }

  async function waitForProgress(runId, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${apiBase}/runs/${runId}`, { headers: { Authorization: `Bearer ${tokenA}` } });
      if (res.ok) {
        const doc = await res.json();
        if (doc.totalRequests > 0) return doc;
        if (['failed', 'cancelled', 'timed_out'].includes(doc.status)) throw new Error(`Run ended before recording traffic: ${doc.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Run ${runId} did not persist request progress within ${timeoutMs}ms`);
  }

  function isPidDead(pid) {
    try {
      process.kill(pid, 0);
      return false; // Process is still running
    } catch (err) {
      return true; // ESRCH: process does not exist
    }
  }

  // --- Test A: Cancel a 1-worker, 2-worker and 4-worker run ---
  for (const workerCount of [1, 2, 4]) {
    await t.test(`Cancel distributed run with workerCount=${workerCount}`, async () => {
      const postRes = await fetch(`${apiBase}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          targetId: targetDoc.id,
          concurrency: 4,
          durationSec: 10,
          workerCount,
          authorized: true,
        }),
      });
      assert.equal(postRes.status, 202);
      const created = await postRes.json();
      const runId = created.id;

      // Allow workers to start and capture PIDs
      await new Promise(r => setTimeout(r, 300));
      const active = runner.activeRuns.get(runId);
      assert.ok(active, 'Active run entry must exist');

      let pids = [];
      if (active.coordinator) {
        pids = active.coordinator.getWorkerPids();
      } else if (active.child?.pid) {
        pids = [active.child.pid];
      }
      assert.ok(pids.length > 0, `Worker PIDs must be tracked for workerCount=${workerCount}`);

      // Issue cancel
      const cancelRes = await fetch(`${apiBase}/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(cancelRes.status, 200);
      const cancelJson = await cancelRes.json();
      assert.equal(cancelJson.requested, true);

      // Verify status transitions cleanly to 'cancelled'
      const finalDoc = await waitForTerminal(runId);
      assert.equal(finalDoc.status, 'cancelled');
      assert.ok(finalDoc.finishedAt);

      // Verify all child worker PIDs are dead (zero leaks)
      await new Promise(r => setTimeout(r, 200));
      for (const pid of pids) {
        assert.equal(isPidDead(pid), true, `Worker PID ${pid} must be terminated`);
      }

      // Accounting consistency
      assert.equal(
        finalDoc.totalRequests,
        finalDoc.successCount + finalDoc.failedCount,
        'totalRequests must equal success + failed'
      );
      assert.equal(runner.activeRuns.has(runId), false, 'Active runs map must be clean');
    });
  }

  // --- Test B: Cancel shortly after start (<1s) vs after several seconds ---
  await t.test('Cancel shortly after start (<300ms)', async () => {
    const postRes = await fetch(`${apiBase}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetDoc.id,
        concurrency: 2,
        durationSec: 10,
        workerCount: 2,
        authorized: true,
      }),
    });
    const created = await postRes.json();
    await new Promise(r => setTimeout(r, 100)); // <1s quick cancel

    const cancelRes = await fetch(`${apiBase}/runs/${created.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(cancelRes.status, 200);
    const finalDoc = await waitForTerminal(created.id);
    assert.equal(finalDoc.status, 'cancelled');
  });

  await t.test('Cancel after several seconds of active traffic (1.5s)', async () => {
    const postRes = await fetch(`${apiBase}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetDoc.id,
        concurrency: 4,
        durationSec: 10,
        workerCount: 2,
        authorized: true,
      }),
    });
    const created = await postRes.json();
    await waitForProgress(created.id);
    await new Promise(r => setTimeout(r, 150)); // Let additional requests enter flight.

    const cancelRes = await fetch(`${apiBase}/runs/${created.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(cancelRes.status, 200);
    const finalDoc = await waitForTerminal(created.id);
    assert.equal(finalDoc.status, 'cancelled');
    assert.ok(finalDoc.totalRequests > 0, 'Must preserve requests completed before cancellation');
    assert.ok(finalDoc.rps > 0);
  });

  // --- Test C: Cancel completed run -> rejected; cancel invalid ID -> 404 ---
  await t.test('Cancel completed run returns 409 Conflict', async () => {
    // Run short 1s test
    const postRes = await fetch(`${apiBase}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetDoc.id,
        concurrency: 1,
        durationSec: 1,
        workerCount: 1,
        authorized: true,
      }),
    });
    const created = await postRes.json();
    const completedDoc = await waitForTerminal(created.id, 15000);
    assert.equal(completedDoc.status, 'completed');

    // Attempt cancel on completed run
    const cancelRes = await fetch(`${apiBase}/runs/${created.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(cancelRes.status, 409);
    const errJson = await cancelRes.json();
    assert.match(errJson.error, /already finished/i);
  });

  await t.test('Cancel unknown run ID returns 404 Not Found', async () => {
    const cancelRes = await fetch(`${apiBase}/runs/00000000-0000-0000-0000-000000000000/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(cancelRes.status, 404);
  });

  // --- Test D: Cancel is user-scoped (User B cannot cancel User A run) ---
  await t.test('User B cannot cancel User A active run (returns 404)', async () => {
    const postRes = await fetch(`${apiBase}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetDoc.id,
        concurrency: 2,
        durationSec: 10,
        workerCount: 1,
        authorized: true,
      }),
    });
    const created = await postRes.json();
    await new Promise(r => setTimeout(r, 200));

    // User B attempts cancellation
    const cancelRes = await fetch(`${apiBase}/runs/${created.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(cancelRes.status, 404);

    // Clean up by cancelling with User A
    await fetch(`${apiBase}/runs/${created.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    await waitForTerminal(created.id);
  });

  // --- Test E: Start a NEW run immediately after cancellation ---
  await t.test('New run immediately after cancel is clean and uncontaminated', async () => {
    const postRes = await fetch(`${apiBase}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetDoc.id,
        concurrency: 2,
        durationSec: 2,
        workerCount: 2,
        authorized: true,
      }),
    });
    const created = await postRes.json();
    const finalDoc = await waitForTerminal(created.id, 5000);

    assert.equal(finalDoc.status, 'completed');
    assert.ok(finalDoc.totalRequests > 0);
    assert.equal(finalDoc.cancelledCount, 0, 'New run must have 0 cancelledCount');
    assert.equal(finalDoc.failedCount, 0);
    assert.equal(finalDoc.errorRate, 0);
  });
});

