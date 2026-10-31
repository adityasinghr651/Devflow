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

test('E2E: Full User-to-Results Workflow Verification', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-e2e-workflow-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  // 1. Mock microservice target server
  let handledRequests = 0;
  const mockTarget = http.createServer((req, res) => {
    handledRequests++;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', reqNum: handledRequests }));
    }, 10);
  });

  await new Promise(res => mockTarget.listen(0, '127.0.0.1', res));
  const targetPort = mockTarget.address().port;
  const targetUrl = `http://127.0.0.1:${targetPort}`;

  // 2. Start ServerTest API server
  const app = createApp();
  const apiServer = http.createServer(app);
  await new Promise(res => apiServer.listen(0, '127.0.0.1', res));
  const apiPort = apiServer.address().port;
  const baseUrl = `http://127.0.0.1:${apiPort}/api`;

  t.after(async () => {
    await new Promise(r => mockTarget.close(r));
    await new Promise(r => apiServer.close(r));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // Step 1: User Registration
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Aditya Engineer',
      email: 'aditya.workflow@test.local',
      password: 'ProductionPassword2026!',
    }),
  });
  assert.equal(regRes.status, 201);
  const { user, token } = await regRes.json();
  assert.ok(token);
  assert.equal(user.email, 'aditya.workflow@test.local');

  // Step 2: Target Registration
  const targetRes = await fetch(`${baseUrl}/targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'E2E Microservice',
      url: targetUrl,
      environment: 'Development',
    }),
  });
  assert.equal(targetRes.status, 201);
  const target = await targetRes.json();
  assert.ok(target.id);
  assert.equal(target.url, targetUrl);

  // Step 3: Configure and launch test run
  const runLaunchRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      targetId: target.id,
      path: '/api/v1/health',
      method: 'GET',
      concurrency: 3,
      durationSec: 2,
      authorized: true,
    }),
  });
  assert.equal(runLaunchRes.status, 202);
  const initialRun = await runLaunchRes.json();
  assert.ok(initialRun.id);
  assert.equal(initialRun.status, 'queued');

  // Step 4: Monitor test run until completion
  let completedRun = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const pollRes = await fetch(`${baseUrl}/runs/${initialRun.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (pollRes.ok) {
      const runData = await pollRes.json();
      if (['completed', 'failed', 'cancelled'].includes(runData.status)) {
        completedRun = runData;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }

  assert.ok(completedRun, 'Run did not reach completion in time');
  assert.equal(completedRun.status, 'completed');
  assert.ok(completedRun.totalRequests > 0, `Expected requests > 0, got ${completedRun.totalRequests}`);
  assert.ok(handledRequests > 0, `Expected target requests > 0, got ${handledRequests}`);
  assert.ok(completedRun.statusCodes['200'] > 0);
  assert.ok(completedRun.rps > 0);
  assert.ok(completedRun.p50 > 0);
  assert.ok(completedRun.p95 > 0);
  assert.ok(completedRun.p99 > 0);

  // Step 5: Simulate Backend Restart
  await new Promise(r => apiServer.close(r));

  // Boot restarted server with same storage
  const restartedApp = createApp();
  const restartedApiServer = http.createServer(restartedApp);
  await new Promise(res => restartedApiServer.listen(0, '127.0.0.1', res));
  const restartedPort = restartedApiServer.address().port;
  const restartedBaseUrl = `http://127.0.0.1:${restartedPort}/api`;

  const runner = getRunnerManager(storage);
  await runner.startupRecovery();

  // Step 6: Historical Report Retrieval after restart
  const historyRes = await fetch(`${restartedBaseUrl}/runs/${initialRun.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.equal(historyData.status, 'completed');
  assert.equal(historyData.totalRequests, completedRun.totalRequests);
  assert.equal(historyData.p95, completedRun.p95);
  assert.deepEqual(historyData.statusCodes, completedRun.statusCodes);

  await new Promise(r => restartedApiServer.close(r));
});

