import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionInteger, partitionWorkload } from '../../server/runner/partitioner.js';
import { ProgressAggregator } from '../../server/runner/progress-aggregator.js';
import { validateRunPayload } from '../../server/security/validation.js';

test('Workload Partitioning: partitionInteger remainder distribution', async (t) => {
  // Exact division
  assert.deepEqual(partitionInteger(10, 2), [5, 5]);
  assert.deepEqual(partitionInteger(20, 4), [5, 5, 5, 5]);

  // Remainder distribution: 10 across 3 workers -> 4, 3, 3
  assert.deepEqual(partitionInteger(10, 3), [4, 3, 3]);

  // Remainder distribution: 7 across 2 workers -> 4, 3
  assert.deepEqual(partitionInteger(7, 2), [4, 3]);

  // Remainder distribution: 1 across 4 workers -> 1, 0, 0, 0
  assert.deepEqual(partitionInteger(1, 4), [1, 0, 0, 0]);

  // Zero concurrency
  assert.deepEqual(partitionInteger(0, 3), [0, 0, 0]);

  // 1 worker -> identity
  assert.deepEqual(partitionInteger(15, 1), [15]);

  // Safe fallback on invalid count
  assert.deepEqual(partitionInteger(10, 0), [10]);
  assert.deepEqual(partitionInteger(10, -3), [10]);
  assert.deepEqual(partitionInteger(10, null), [10]);
});

test('Workload Partitioning: partitionWorkload fixed concurrency profile', async (t) => {
  const runConfig = {
    id: 'run-1',
    url: 'http://127.0.0.1:4000/api',
    method: 'GET',
    concurrency: 10,
    durationSec: 5,
    profile: 'fixed',
  };

  // 1 worker
  const slices1 = partitionWorkload(runConfig, 1);
  assert.equal(slices1.length, 1);
  assert.equal(slices1[0].concurrency, 10);
  assert.equal(slices1[0].workerIndex, 0);
  assert.equal(slices1[0].workerCount, 1);

  // 2 workers
  const slices2 = partitionWorkload(runConfig, 2);
  assert.equal(slices2.length, 2);
  assert.equal(slices2[0].concurrency, 5);
  assert.equal(slices2[1].concurrency, 5);
  assert.equal(slices2[0].workerIndex, 0);
  assert.equal(slices2[1].workerIndex, 1);
  assert.equal(slices2.reduce((sum, s) => sum + s.concurrency, 0), 10);

  // 4 workers (10 / 4 -> 3, 3, 2, 2)
  const slices4 = partitionWorkload(runConfig, 4);
  assert.equal(slices4.length, 4);
  assert.deepEqual(slices4.map(s => s.concurrency), [3, 3, 2, 2]);
  assert.equal(slices4.reduce((sum, s) => sum + s.concurrency, 0), 10);
});

test('Workload Partitioning: partitionWorkload staged concurrency profile', async (t) => {
  const stagedRun = {
    id: 'run-stages-1',
    url: 'http://127.0.0.1:4000/api',
    method: 'POST',
    profile: 'stages',
    stages: [
      { durationSec: 2, target: 5 },
      { durationSec: 4, target: 11 },
      { durationSec: 2, target: 0 },
    ],
    concurrency: 11,
    durationSec: 8,
  };

  const slices = partitionWorkload(stagedRun, 2);
  assert.equal(slices.length, 2);

  // Worker 0 and Worker 1 stage targets
  const w0Stages = slices[0].stages;
  const w1Stages = slices[1].stages;

  assert.equal(w0Stages.length, 3);
  assert.equal(w1Stages.length, 3);

  // Stage 1: target 5 -> 3, 2
  assert.equal(w0Stages[0].target, 3);
  assert.equal(w1Stages[0].target, 2);
  assert.equal(w0Stages[0].target + w1Stages[0].target, 5);
  assert.equal(w0Stages[0].durationSec, 2);
  assert.equal(w1Stages[0].durationSec, 2);

  // Stage 2: target 11 -> 6, 5
  assert.equal(w0Stages[1].target, 6);
  assert.equal(w1Stages[1].target, 5);
  assert.equal(w0Stages[1].target + w1Stages[1].target, 11);

  // Stage 3: target 0 -> 0, 0
  assert.equal(w0Stages[2].target, 0);
  assert.equal(w1Stages[2].target, 0);
  assert.equal(w0Stages[2].target + w1Stages[2].target, 0);
});

test('Progress Aggregation: Multi-worker cumulative progress snapshots', async (t) => {
  const aggregator = new ProgressAggregator(2, 10);

  // Initial update from Worker 0
  const p1 = aggregator.updateWorker(0, {
    totalRequests: 50,
    successCount: 48,
    failedCount: 2,
    currentConcurrency: 5,
    statusCodes: { '200': 48, '500': 2 },
    elapsedSec: 2.0,
    progressPercent: 20.0,
  });

  assert.equal(p1.totalRequests, 50);
  assert.equal(p1.successCount, 48);
  assert.equal(p1.failedCount, 2);
  assert.equal(p1.currentConcurrency, 5);
  assert.deepEqual(p1.statusCodes, { '200': 48, '500': 2 });

  // Update from Worker 1
  const p2 = aggregator.updateWorker(1, {
    totalRequests: 40,
    successCount: 40,
    failedCount: 0,
    currentConcurrency: 5,
    statusCodes: { '200': 40 },
    elapsedSec: 2.1,
    progressPercent: 21.0,
  });

  // Combined metrics
  assert.equal(p2.totalRequests, 90);
  assert.equal(p2.successCount, 88);
  assert.equal(p2.failedCount, 2);
  assert.equal(p2.currentConcurrency, 10);
  assert.deepEqual(p2.statusCodes, { '200': 88, '500': 2 });
  assert.ok(p2.rps > 0);
  assert.equal(p2.errorRate, Number(((2 / 90) * 100).toFixed(2)));

  // Cumulative snapshot from Worker 0 (total 100, NOT adding 50 + 100)
  const p3 = aggregator.updateWorker(0, {
    totalRequests: 100,
    successCount: 96,
    failedCount: 4,
    currentConcurrency: 5,
    statusCodes: { '200': 96, '500': 4 },
    elapsedSec: 4.0,
    progressPercent: 40.0,
  });

  assert.equal(p3.totalRequests, 140, 'Total requests must be 100 (W0) + 40 (W1) = 140, not cumulative sum');
  assert.equal(p3.successCount, 136);
  assert.equal(p3.failedCount, 4);
  assert.deepEqual(p3.statusCodes, { '200': 136, '500': 4 });
});

test('Validation: Worker count validation rules', async (t) => {
  const dummyTarget = {
    id: 't-1',
    name: 'Target 1',
    url: 'http://localhost:3000',
    verified: true,
  };

  const basePayload = {
    targetId: 't-1',
    path: '/',
    method: 'GET',
    concurrency: 5,
    durationSec: 10,
    authorized: true,
  };

  // Valid worker counts: 1, 2, 4
  const v1 = validateRunPayload({ ...basePayload, workerCount: 1 }, dummyTarget);
  assert.equal(v1.valid, true);
  assert.equal(v1.data.workerCount, 1);

  const v2 = validateRunPayload({ ...basePayload, workerCount: 2 }, dummyTarget);
  assert.equal(v2.valid, true);
  assert.equal(v2.data.workerCount, 2);

  const v4 = validateRunPayload({ ...basePayload, workerCount: 4 }, dummyTarget);
  assert.equal(v4.valid, true);
  assert.equal(v4.data.workerCount, 4);

  // Default when omitted
  const vDefault = validateRunPayload(basePayload, dummyTarget);
  assert.equal(vDefault.valid, true);
  assert.equal(vDefault.data.workerCount, 1);

  // Invalid worker counts rejected with 400
  const v3 = validateRunPayload({ ...basePayload, workerCount: 3 }, dummyTarget);
  assert.equal(v3.valid, false);
  assert.equal(v3.statusCode, 400);
  assert.match(v3.error, /Worker count must be an integer of 1, 2, or 4/);

  const v8 = validateRunPayload({ ...basePayload, workerCount: 8 }, dummyTarget);
  assert.equal(v8.valid, false);
  assert.equal(v8.statusCode, 400);

  const vZero = validateRunPayload({ ...basePayload, workerCount: 0 }, dummyTarget);
  assert.equal(vZero.valid, false);
  assert.equal(vZero.statusCode, 400);

  const vFloat = validateRunPayload({ ...basePayload, workerCount: 2.5 }, dummyTarget);
  assert.equal(vFloat.valid, false);
  assert.equal(vFloat.statusCode, 400);

  const vString = validateRunPayload({ ...basePayload, workerCount: 'two' }, dummyTarget);
  assert.equal(vString.valid, false);
  assert.equal(vString.statusCode, 400);
});

