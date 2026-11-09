import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { setStorage } from '../../server/storage/index.js';
import { generateToken } from '../../server/security/auth.js';

test('regression API is authenticated and owner-scoped, returns the exact comparison explanation', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-regression-api-'));
  const storage = new JsonStorage(temp);
  await storage.init();
  setStorage(storage);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await storage.close();
    await fs.rm(temp, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const owner = await storage.createUser({ email: 'owner@example.test', name: 'Owner', passwordHash: 'test-hash' });
  const token = generateToken(owner);
  const headers = { Authorization: `Bearer ${token}` };
  const makeRun = (id, startedAt, rps) => ({
    id, userId: owner.id, targetId: 'target-1', targetName: 'Local', url: 'http://127.0.0.1:5050/fixed?delayMs=50',
    method: 'GET', concurrency: 4, durationSec: 2, profile: 'fixed', engine: 'node', workerCount: 1,
    status: 'completed', startedAt, finishedAt: new Date(Date.parse(startedAt) + 1000).toISOString(),
    totalRequests: 200, successCount: 200, failedCount: 0, rps, p95: 50, p99: 90, errorRate: 0,
  });
  for (const [index, rps] of [100, 100, 100].entries()) {
    await storage.createRun(makeRun(`prior-${index}`, new Date(index * 1000 + 1000).toISOString(), rps));
  }
  await storage.createRun(makeRun('current', new Date(10000).toISOString(), 80));
  const result = await fetch(`${base}/runs/current/regression`, { headers });
  assert.equal(result.status, 200);
  const verdict = await result.json();
  assert.equal(verdict.verdict, 'regression');
  assert.equal(verdict.baselineCount, 3);
  assert.equal(verdict.metrics.rps.observed, 80);
  assert.deepEqual(verdict.baselineRunIds, ['prior-2', 'prior-1', 'prior-0']);
  assert.equal((await fetch(`${base}/runs/current/regression`)).status, 401);
  const otherAccount = await storage.createUser({ email: 'other@example.test', name: 'Other', passwordHash: 'test-hash' });
  const otherUser = generateToken(otherAccount);
  assert.equal((await fetch(`${base}/runs/current/regression`, { headers: { Authorization: `Bearer ${otherUser}` } })).status, 404);
});
