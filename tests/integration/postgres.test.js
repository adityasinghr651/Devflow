import test from 'node:test';
import assert from 'node:assert/strict';
import { PgStorage } from '../../server/storage/postgres-storage.js';
import { runMigrations } from '../../server/storage/migrations/runner.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:root@127.0.0.1:5432/servertest_test';

test('PostgreSQL: Real Database Integration & Lifecycle', async (t) => {
  let storage;

  try {
    storage = new PgStorage(TEST_DATABASE_URL);
    await storage.init();
  } catch (err) {
    t.skip(`Skipping PostgreSQL tests: unable to connect to ${TEST_DATABASE_URL}: ${err.message}`);
    return;
  }

  t.after(async () => {
    if (storage) {
      await storage.close().catch(() => {});
    }
  });

  // Clean tables before running test assertions
  await storage.pool.query('TRUNCATE users, audit_events CASCADE;');

  // 1. Verify Migrations applied
  const migRes = await storage.pool.query('SELECT version FROM schema_migrations ORDER BY version ASC');
  assert.ok(migRes.rows.length >= 2);
  assert.equal(migRes.rows[0].version, '001_initial_schema.sql');
  assert.equal(migRes.rows[1].version, '002_advanced_profiles_and_verification.sql');

  // Idempotency: Running migrations again should apply 0 new migrations
  const reapply = await runMigrations(storage.pool);
  assert.equal(reapply.length, 0);

  // 2. User Creation & Uniqueness Constraint
  const userA = await storage.createUser({
    email: 'pg_alice@example.com',
    passwordHash: '$2a$10$realhashforpgalice12345678901234567890',
    name: 'PG Alice',
    role: 'user',
  });
  assert.ok(userA.id);
  assert.equal(userA.email, 'pg_alice@example.com');

  // Duplicate email should throw unique constraint violation (code 23505)
  await assert.rejects(
    async () => await storage.createUser({
      email: 'pg_alice@example.com',
      passwordHash: 'another_hash',
      name: 'Duplicate Alice',
    }),
    (err) => err.code === '23505' || /unique/i.test(err.message)
  );

  // 3. Target Creation and Scoped Retrieval
  const targetA = await storage.createTarget({
    id: '11111111-1111-1111-1111-111111111111',
    userId: userA.id,
    name: 'Alice PG Target',
    url: 'http://localhost:3000',
    environment: 'Development',
    verified: false,
    verificationToken: 'st_tok_pg_test_123',
    verificationMethod: null,
    verifiedAt: null,
  });
  assert.ok(targetA.id);
  assert.equal(targetA.userId, userA.id);
  assert.equal(targetA.verificationToken, 'st_tok_pg_test_123');
  assert.equal(targetA.verified, false);

  // Update target to verified
  const updatedTarget = await storage.updateTarget(
    targetA.id,
    {
      verified: true,
      verificationMethod: 'dns_txt',
      verifiedAt: new Date().toISOString(),
    },
    userA.id
  );
  assert.equal(updatedTarget.verified, true);
  assert.equal(updatedTarget.verificationMethod, 'dns_txt');

  const targets = await storage.getTargets(userA.id);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, targetA.id);
  assert.equal(targets[0].verified, true);

  // Foreign Key Constraint: Invalid user_id must be rejected (code 23503)
  await assert.rejects(
    async () => await storage.createTarget({
      id: '22222222-2222-2222-2222-222222222222',
      userId: '00000000-0000-0000-0000-000000000000',
      name: 'Invalid Target',
      url: 'http://localhost:3000',
    }),
    (err) => err.code === '23503' || /foreign key/i.test(err.message)
  );

  // 4. Test Run Creation & Advanced Phase 4 Fields (Stages, Headers, Body, Timeout)
  const stagedRun = await storage.createRun({
    id: '33333333-3333-3333-3333-333333333333',
    userId: userA.id,
    targetId: targetA.id,
    targetName: targetA.name,
    url: 'http://localhost:3000/api/health',
    method: 'POST',
    concurrency: 10,
    durationSec: 15,
    profile: 'stages',
    stages: [
      { durationSec: 5, target: 5 },
      { durationSec: 10, target: 10 },
    ],
    headers: { 'Content-Type': 'application/json', 'Authorization': '[REDACTED]' },
    body: '{"test":true}',
    timeoutMs: 4000,
    status: 'queued',
  });
  assert.ok(stagedRun.id);
  assert.equal(stagedRun.status, 'queued');
  assert.equal(stagedRun.profile, 'stages');
  assert.equal(stagedRun.stages.length, 2);
  assert.equal(stagedRun.headers['Authorization'], '[REDACTED]');
  assert.equal(stagedRun.body, '{"test":true}');
  assert.equal(stagedRun.timeoutMs, 4000);

  // Check constraint on duration (> 30s)
  await assert.rejects(
    async () => await storage.createRun({
      id: '44444444-4444-4444-4444-444444444444',
      userId: userA.id,
      targetId: targetA.id,
      targetName: targetA.name,
      url: 'http://localhost:3000/api/health',
      method: 'GET',
      concurrency: 5,
      durationSec: 60, // Exceeds CHECK (duration_sec <= 30)
      status: 'queued',
    }),
    (err) => err.code === '23514' || /check/i.test(err.message)
  );

  // Update Run to completed with real percentiles and JSONB status codes
  await storage.updateRun(stagedRun.id, {
    status: 'completed',
    totalRequests: 250,
    successCount: 245,
    failedCount: 5,
    rps: 25.0,
    p50: 12.5,
    p95: 45.2,
    p99: 89.0,
    errorRate: 2.0,
    statusCodes: { '200': 245, '500': 5 },
    finishedAt: new Date().toISOString(),
  });

  const completedRun = await storage.getRunById(stagedRun.id, userA.id);
  assert.equal(completedRun.status, 'completed');
  assert.equal(completedRun.totalRequests, 250);
  assert.equal(completedRun.p95, 45.2);
  assert.deepEqual(completedRun.statusCodes, { '200': 245, '500': 5 });

  // 5. Verification of Persistence Across Backend Restart
  await storage.close();

  // Create new storage instance simulating a restart
  const restartedStorage = new PgStorage(TEST_DATABASE_URL);
  await restartedStorage.init();

  const persistedUser = await restartedStorage.getUserByEmail('pg_alice@example.com');
  assert.ok(persistedUser);
  assert.equal(persistedUser.id, userA.id);

  const persistedTarget = await restartedStorage.getTargetById(targetA.id, userA.id);
  assert.ok(persistedTarget);
  assert.equal(persistedTarget.name, 'Alice PG Target');
  assert.equal(persistedTarget.verified, true);
  assert.equal(persistedTarget.verificationMethod, 'dns_txt');

  const persistedRun = await restartedStorage.getRunById(stagedRun.id, userA.id);
  assert.ok(persistedRun);
  assert.equal(persistedRun.status, 'completed');
  assert.equal(persistedRun.totalRequests, 250);
  assert.equal(persistedRun.p99, 89.0);
  assert.equal(persistedRun.profile, 'stages');
  assert.equal(persistedRun.stages.length, 2);
  assert.equal(persistedRun.headers['Authorization'], '[REDACTED]');

  // 6. Cascade Deletion Behavior
  // Deleting userA should cascade delete targetA and stagedRun
  await restartedStorage.pool.query('DELETE FROM users WHERE id = $1', [userA.id]);

  const targetAfterDelete = await restartedStorage.getTargetById(targetA.id);
  assert.equal(targetAfterDelete, null);

  const runAfterDelete = await restartedStorage.getRunById(stagedRun.id);
  assert.equal(runAfterDelete, null);

  await restartedStorage.close();
});

test('PostgreSQL: Clear failure on invalid connection URL', async () => {
  const invalidStorage = new PgStorage('postgresql://postgres:root@127.0.0.1:59999/nonexistent_db', {
    connectionTimeoutMillis: 1000,
  });

  await assert.rejects(
    async () => await invalidStorage.init(),
    /connect|ECONNREFUSED/i
  );

  await invalidStorage.close().catch(() => {});
});

