import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerManager } from '../../server/runner/manager.js';

test('Runner dispatch failure marks an accepted run failed instead of leaving it queued', async () => {
  const run = {
    id: 'dispatch-failure-run',
    status: 'queued',
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  let failInitialRead = true;
  const storage = {
    async getRunById(id) {
      assert.equal(id, run.id);
      if (failInitialRead) {
        failInitialRead = false;
        throw new Error('temporary storage read failure');
      }
      return structuredClone(run);
    },
    async updateRun(id, updates) {
      assert.equal(id, run.id);
      Object.assign(run, updates);
      return structuredClone(run);
    },
  };
  const manager = new RunnerManager(storage);

  await manager.enqueueRun(run);
  const deadline = Date.now() + 1000;
  while (run.status === 'queued' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(run.status, 'failed');
  assert.match(run.error, /Could not start test execution: temporary storage read failure/);
  assert.ok(run.finishedAt);
  assert.equal(manager.runningCount, 0);
});
