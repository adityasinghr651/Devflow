import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';

test('Multi-User: Strict resource isolation and privilege escalation prevention', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-multiuser-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // 1. Register Alice
  const aliceReg = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'alice@company.com', password: 'Password123!' }),
  });
  assert.equal(aliceReg.status, 201);
  const { token: aliceToken, user: aliceUser } = await aliceReg.json();

  // 2. Register Bob
  const bobReg = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bob', email: 'bob@company.com', password: 'Password123!' }),
  });
  assert.equal(bobReg.status, 201);
  const { token: bobToken, user: bobUser } = await bobReg.json();

  // 3. Alice creates Target A
  const aliceTargetRes = await fetch(`${baseUrl}/targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      name: "Alice's Core Service",
      url: 'http://localhost:3000',
      environment: 'Development',
    }),
  });
  assert.equal(aliceTargetRes.status, 201);
  const targetA = await aliceTargetRes.json();

  // 4. Bob creates Target B
  const bobTargetRes = await fetch(`${baseUrl}/targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bobToken}`,
    },
    body: JSON.stringify({
      name: "Bob's Microservice",
      url: 'http://localhost:4000',
      environment: 'Staging',
    }),
  });
  assert.equal(bobTargetRes.status, 201);
  const targetB = await bobTargetRes.json();

  // 5. Query isolation: Alice sees Target A, not Target B
  const aliceTargetsRes = await fetch(`${baseUrl}/targets`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const aliceTargets = await aliceTargetsRes.json();
  assert.equal(aliceTargets.length, 1);
  assert.equal(aliceTargets[0].id, targetA.id);

  // Bob sees Target B, not Target A
  const bobTargetsRes = await fetch(`${baseUrl}/targets`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const bobTargets = await bobTargetsRes.json();
  assert.equal(bobTargets.length, 1);
  assert.equal(bobTargets[0].id, targetB.id);

  // 6. Horizontal Privilege Escalation: Bob attempts to delete Alice's Target A
  const bobDeleteTargetRes = await fetch(`${baseUrl}/targets/${targetA.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  // Must return 404 without leaking that targetA belongs to someone else
  assert.equal(bobDeleteTargetRes.status, 404);

  // Confirm targetA still exists for Alice
  const aliceCheck = await fetch(`${baseUrl}/targets`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const aliceCheckData = await aliceCheck.json();
  assert.equal(aliceCheckData.length, 1);

  // 7. Horizontal Privilege Escalation: Bob attempts to launch test against Alice's target
  const bobRunOnAliceTargetRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bobToken}`,
    },
    body: JSON.stringify({
      targetId: targetA.id,
      path: '/api/health',
      method: 'GET',
      concurrency: 2,
      durationSec: 1,
      authorized: true,
    }),
  });
  assert.equal(bobRunOnAliceTargetRes.status, 404);
  const bobRunError = await bobRunOnAliceTargetRes.json();
  assert.match(bobRunError.error, /Target not found/);

  // 8. Alice launches a legitimate run on Target A
  const aliceRunRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      targetId: targetA.id,
      path: '/api/health',
      method: 'GET',
      concurrency: 2,
      durationSec: 2,
      authorized: true,
    }),
  });
  assert.equal(aliceRunRes.status, 202);
  const runA = await aliceRunRes.json();

  // 9. Horizontal Privilege Escalation: Bob attempts to inspect Alice's run details
  const bobGetRunRes = await fetch(`${baseUrl}/runs/${runA.id}`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert.equal(bobGetRunRes.status, 404);

  // 10. Horizontal Privilege Escalation: Bob attempts to cancel Alice's run
  const bobCancelRunRes = await fetch(`${baseUrl}/runs/${runA.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert.equal(bobCancelRunRes.status, 404);

  // Alice can successfully cancel her own run
  const aliceCancelRes = await fetch(`${baseUrl}/runs/${runA.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  assert.equal(aliceCancelRes.status, 200);
});

