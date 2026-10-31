import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStorage } from '../../server/storage/json-storage.js';

test('Storage: Multi-user CRUD and lifecycle with JsonStorage', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-storage-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  // 1. Create Users
  const user1 = await storage.createUser({
    email: 'alice@example.com',
    passwordHash: 'hashed_pw_alice',
    name: 'Alice Developer',
  });
  assert.ok(user1.id);
  assert.equal(user1.email, 'alice@example.com');

  const user2 = await storage.createUser({
    email: 'bob@example.com',
    passwordHash: 'hashed_pw_bob',
    name: 'Bob Operator',
  });
  assert.ok(user2.id);

  // Duplicate email prevention
  await assert.rejects(
    async () => await storage.createUser({
      email: 'alice@example.com',
      passwordHash: 'other_hash',
      name: 'Alice Clone',
    }),
    /already registered/
  );

  // 2. Targets scoped to user
  const target1 = await storage.createTarget({
    userId: user1.id,
    name: 'Alice Dev API',
    url: 'http://localhost:3000',
    environment: 'Development',
  });
  assert.ok(target1.id);
  assert.equal(target1.userId, user1.id);

  const target2 = await storage.createTarget({
    userId: user2.id,
    name: 'Bob Staging API',
    url: 'http://localhost:4001',
    environment: 'Staging',
  });
  assert.ok(target2.id);
  assert.equal(target2.userId, user2.id);

  // Scoped querying
  const aliceTargets = await storage.getTargets(user1.id);
  assert.equal(aliceTargets.length, 1);
  assert.equal(aliceTargets[0].id, target1.id);

  const bobTargets = await storage.getTargets(user2.id);
  assert.equal(bobTargets.length, 1);
  assert.equal(bobTargets[0].id, target2.id);

  // Cross-user target fetch returns null
  const crossTarget = await storage.getTargetById(target1.id, user2.id);
  assert.equal(crossTarget, null);

  // 3. Runs scoped to user
  const run1 = await storage.createRun({
    userId: user1.id,
    targetId: target1.id,
    targetName: target1.name,
    url: 'http://localhost:3000/api/health',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    status: 'queued',
  });
  assert.ok(run1.id);
  assert.equal(run1.userId, user1.id);

  const aliceRuns = await storage.getRuns(user1.id);
  assert.equal(aliceRuns.length, 1);

  const bobRuns = await storage.getRuns(user2.id);
  assert.equal(bobRuns.length, 0);

  // Cross-user run fetch returns null
  const crossRun = await storage.getRunById(run1.id, user2.id);
  assert.equal(crossRun, null);

  // 4. Stale run cleanup on server restart
  await storage.updateRun(run1.id, { status: 'running' });
  const cleanedCount = await storage.cleanupStaleRuns();
  assert.equal(cleanedCount, 1);

  const cleanedRun = await storage.getRunById(run1.id);
  assert.equal(cleanedRun.status, 'failed');
  assert.match(cleanedRun.error, /Aborted due to unexpected server restart/);

  // 5. Cascade delete target deletes its runs
  const deleted = await storage.deleteTarget(target1.id, user1.id);
  assert.equal(deleted, true);

  const targetCheck = await storage.getTargetById(target1.id);
  assert.equal(targetCheck, null);

  const runCheck = await storage.getRunById(run1.id);
  assert.equal(runCheck, null);

  // Clean up
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
