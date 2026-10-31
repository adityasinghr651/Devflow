import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';

test('Reliability: Startup recovery cleans up orphaned active runs', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-recovery-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  // Create 3 runs in active states (representing runs interrupted by crash)
  const run1 = await storage.createRun({
    id: 'crash-run-1',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    status: 'queued',
  });

  const run2 = await storage.createRun({
    id: 'crash-run-2',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    status: 'running',
  });

  const run3 = await storage.createRun({
    id: 'crash-run-3',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    status: 'completed', // Already completed, must NOT be modified
  });

  const runner = new RunnerManager(storage);
  await runner.startupRecovery();

  const r1 = await storage.getRunById('crash-run-1');
  assert.equal(r1.status, 'failed');
  assert.match(r1.error, /Aborted due to unexpected server restart/);
  assert.ok(r1.finishedAt);

  const r2 = await storage.getRunById('crash-run-2');
  assert.equal(r2.status, 'failed');
  assert.match(r2.error, /Aborted due to unexpected server restart/);
  assert.ok(r2.finishedAt);

  const r3 = await storage.getRunById('crash-run-3');
  assert.equal(r3.status, 'completed'); // Unchanged

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

test('Reliability: Legal state transitions enforce terminal immutability', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-state-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const run = await storage.createRun({
    id: 'state-run-1',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 2,
    durationSec: 5,
    status: 'queued',
  });

  const runner = new RunnerManager(storage);

  // Transition queued -> validating
  await runner._transitionState(run.id, 'validating');
  let current = await storage.getRunById(run.id);
  assert.equal(current.status, 'validating');

  // Transition validating -> running
  await runner._transitionState(run.id, 'running');
  current = await storage.getRunById(run.id);
  assert.equal(current.status, 'running');

  // Transition running -> completed
  await runner._transitionState(run.id, 'completed', { finishedAt: new Date().toISOString() });
  current = await storage.getRunById(run.id);
  assert.equal(current.status, 'completed');

  // Disallowed transition: completed -> running
  await runner._transitionState(run.id, 'running');
  current = await storage.getRunById(run.id);
  assert.equal(current.status, 'completed'); // Must remain completed!

  // Cancellation on already completed run returns false
  const cancelResult = await runner.cancelRun(run.id);
  assert.equal(cancelResult.success, false);

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

test('Reliability: Prevention of duplicate run execution', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-dup-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const runner = new RunnerManager(storage);

  const run = {
    id: 'dup-run-1',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 1,
    durationSec: 1,
    status: 'completed',
  };

  await storage.createRun(run);

  // First enqueue adds to dispatched set
  await runner.enqueueRun(run);
  assert.equal(runner.dispatchedRuns.has('dup-run-1'), true);

  // Second enqueue detects duplicate and returns immediately without re-enqueuing
  const initialQueueLen = runner.queue.length;
  await runner.enqueueRun(run);
  assert.equal(runner.queue.length, initialQueueLen);

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

test('Reliability: Worker process crash recovery transitions to failed', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-crash-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();

  const runner = new RunnerManager(storage);

  const run = {
    id: 'crash-active-run',
    userId: 'u1',
    targetId: 't1',
    targetName: 'Target 1',
    url: 'http://localhost:3000',
    method: 'GET',
    concurrency: 2,
    durationSec: 10,
    status: 'queued',
  };

  await storage.createRun(run);
  await runner.enqueueRun(run);

  // Wait 300ms for child process to launch
  await new Promise(r => setTimeout(r, 300));

  const active = runner.activeRuns.get('crash-active-run');
  assert.ok(active && active.child);

  // Simulate abrupt process crash / kill
  active.child.kill('SIGKILL');

  // Poll until run status transitions
  let finalRun = null;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const r = await storage.getRunById('crash-active-run');
    if (r && ['failed', 'cancelled'].includes(r.status)) {
      finalRun = r;
      break;
    }
    await new Promise(res => setTimeout(res, 100));
  }

  assert.ok(finalRun);
  assert.ok(['failed', 'cancelled'].includes(finalRun.status));
  assert.ok(finalRun.finishedAt);

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});


