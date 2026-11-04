import test from 'node:test';
import assert from 'node:assert/strict';
import { TestCoordinator } from '../../server/runner/coordinator.js';
import { BUCKET_COUNT } from '../../server/runner/latency-histogram.js';
import { EventEmitter } from 'node:events';
import { config } from '../../server/config.js';

test('Worker supervision validates counters and bounded histogram payloads', () => {
  const coordinator = new TestCoordinator({ id: 'validation', durationSec: 1 });
  assert.equal(coordinator._validWorkerPayload({ totalRequests: 0, failedCount: 0 }), true);
  assert.equal(coordinator._validWorkerPayload({ totalRequests: Number.NaN }), false);
  assert.equal(coordinator._validWorkerPayload({ successCount: -1 }), false);
  assert.equal(coordinator._validWorkerPayload({ histogram: { buckets: Array(BUCKET_COUNT - 1).fill(0) } }), false);
  assert.equal(coordinator._validWorkerPayload({ histogram: { bucketCount: BUCKET_COUNT, buckets: Array(BUCKET_COUNT).fill(0), totalCount: 0, sumLatency: 0, exactSamples: [] } }), true);
});

test('Worker supervision fails a worker that never reports startup progress', async () => {
  const previousStartup = config.workerStartupTimeoutMs;
  config.workerStartupTimeoutMs = 1;
  const child = new EventEmitter();
  child.pid = 12345;
  child.send = () => true;
  child.kill = signal => { queueMicrotask(() => child.emit('exit', null, signal)); return true; };
  const coordinator = new TestCoordinator({ id: 'startup-timeout', durationSec: 5 }, { forkFn: () => child });
  try {
    const result = await coordinator.start();
    assert.equal(result.status, 'failed');
    assert.match(result.error, /startup or progress timeout/);
  } finally {
    config.workerStartupTimeoutMs = previousStartup;
  }
});

test('Worker supervision fails a worker whose progress stops and applies a heap cap', async () => {
  const previousStartup = config.workerStartupTimeoutMs;
  const previousProgress = config.workerNoProgressTimeoutMs;
  config.workerStartupTimeoutMs = 10000;
  config.workerNoProgressTimeoutMs = 1;
  const child = new EventEmitter();
  child.pid = 12346;
  child.send = message => {
    if (message.type === 'start') queueMicrotask(() => child.emit('message', { type: 'progress', data: { totalRequests: 0, successCount: 0 } }));
    return true;
  };
  child.kill = signal => { queueMicrotask(() => child.emit('exit', null, signal)); return true; };
  let workerExecArgv;
  const coordinator = new TestCoordinator({ id: 'progress-timeout', durationSec: 5, timeoutMs: 1 }, {
    forkFn: (_path, _args, options) => { workerExecArgv = options.execArgv; return child; },
  });
  try {
    const result = await coordinator.start();
    assert.equal(result.status, 'failed');
    assert.match(result.error, /startup or progress timeout/);
    assert.ok(workerExecArgv.some(arg => arg.startsWith('--max-old-space-size=')));
  } finally {
    config.workerStartupTimeoutMs = previousStartup;
    config.workerNoProgressTimeoutMs = previousProgress;
  }
});

test('Worker supervision rejects malformed progress messages', async () => {
  const coordinator = new TestCoordinator({ id: 'bad-progress', durationSec: 1 }, {
    transitionState: async (_id, status) => ({ status }),
  });
  coordinator.workers.push({ id: 0, state: 'running', child: { kill() {} } });
  coordinator._handleWorkerMessage(0, { type: 'progress', data: { totalRequests: Number.NaN } });
  const result = await coordinator._completionPromise;
  assert.equal(result.status, 'failed');
  assert.match(result.error, /invalid progress payload/);
});
