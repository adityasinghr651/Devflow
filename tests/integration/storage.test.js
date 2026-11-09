import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { config } from '../../server/config.js';

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

test('Storage: terminal run retention prunes oldest records per user only', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-retention-'));
  const storage = new JsonStorage(tmpDir);
  const previousLimit = config.maxRunsStoredPerUser;
  config.maxRunsStoredPerUser = 2;
  try {
    await storage.init();
    for (const [userId, id] of [['u1', 'old'], ['u1', 'middle'], ['u2', 'other']]) {
      await storage.createRun({ id, userId, targetId: 't', targetName: 'local', url: 'http://127.0.0.1', method: 'GET', concurrency: 1, durationSec: 1, status: 'completed' });
    }
    await storage.createRun({ id: 'new', userId: 'u1', targetId: 't', targetName: 'local', url: 'http://127.0.0.1', method: 'GET', concurrency: 1, durationSec: 1, status: 'completed' });
    assert.deepEqual((await storage.getRuns('u1')).map(run => run.id), ['new', 'middle']);
    assert.equal((await storage.getRuns('u2')).length, 1);
  } finally {
    config.maxRunsStoredPerUser = previousLimit;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Storage: JSON records survive a fresh storage instance', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-storage-restart-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const first = new JsonStorage(tmpDir);
  const user = await first.createUser({ email: 'restart@example.test', passwordHash: 'hash', name: 'Restart User' });
  const target = await first.createTarget({ userId: user.id, name: 'Restart Target', url: 'http://127.0.0.1:5050' });
  const run = await first.createRun({
    userId: user.id, targetId: target.id, targetName: target.name, url: `${target.url}/health`,
    method: 'GET', concurrency: 2, durationSec: 1, status: 'completed', totalRequests: 8, p95: 51.2,
  });

  const afterRestart = new JsonStorage(tmpDir);
  assert.equal((await afterRestart.getUserByEmail(user.email)).id, user.id);
  assert.equal((await afterRestart.getTargets(user.id))[0].id, target.id);
  const persistedRun = await afterRestart.getRunById(run.id, user.id);
  assert.equal(persistedRun.status, 'completed');
  assert.equal(persistedRun.totalRequests, 8);
  assert.equal(persistedRun.p95, 51.2);
});

test('Storage: failed writes reject and do not expose unpersisted records', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-storage-write-failure-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const blocker = path.join(tmpDir, 'not-a-directory');
  await fs.writeFile(blocker, 'preserve');
  storage.dataDir = blocker;
  storage.dataFile = path.join(blocker, 'store.json');

  await assert.rejects(
    storage.createUser({ email: 'unsaved@example.test', passwordHash: 'hash', name: 'Unsaved User' }),
    /EEXIST|not a directory/i
  );
  assert.equal(await storage.getUserByEmail('unsaved@example.test'), null);

  storage.dataDir = tmpDir;
  storage.dataFile = path.join(tmpDir, 'store.json');
  const saved = await storage.createUser({ email: 'unsaved@example.test', passwordHash: 'hash', name: 'Unsaved User' });
  assert.equal((await storage.getUserByEmail(saved.email)).id, saved.id);
});

test('Storage: malformed JSON is preserved and reported instead of replaced', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-storage-corrupt-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const dataFile = path.join(tmpDir, 'store.json');
  const originalContent = '{ invalid existing data';
  await fs.writeFile(dataFile, originalContent, 'utf8');

  const storage = new JsonStorage(tmpDir);
  await assert.rejects(storage.init(), /existing file was left untouched/i);
  assert.equal(await fs.readFile(dataFile, 'utf8'), originalContent);
});

test('Storage: lifetime run quota reservation is atomic under concurrent writes', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-quota-storage-'));
  const storage = new JsonStorage(tempDir); await storage.init();
  t.after(async () => { await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {}); });
  const user = await storage.createUser({ email:'quota@example.test',name:'Quota',passwordHash:'test-hash' });
  const work = Array.from({length:24}, (_, index) => storage.createRun({ id:`quota-${index}`, userId:user.id,targetId:'target',targetName:'Target',url:'http://localhost/',method:'GET',concurrency:1,durationSec:1,status:'completed',totalRequests:0,successCount:0,failedCount:0,rps:0,p50:0,p95:0,p99:0,errorRate:0,statusCodes:{} }, { quotaLimit:15 }));
  const saved = await Promise.all(work);
  assert.equal(saved.filter(Boolean).length, 15);
  assert.equal((await storage.getUserById(user.id)).lifetimeRuns, 15);
  assert.equal(await storage.countRuns(user.id), 15);
});
