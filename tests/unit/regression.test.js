import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRunRegression, fingerprintConfig, REGRESSION_POLICY } from '../../server/runner/regression.js';

function makeRun(id, overrides = {}) {
  return {
    id, userId: 'u1', targetId: 'target-1', url: 'http://127.0.0.1:5050/fixed?delayMs=50',
    method: 'GET', concurrency: 4, durationSec: 2, profile: 'fixed', engine: 'node', workerCount: 1,
    status: 'completed', startedAt: new Date(1000).toISOString(), finishedAt: new Date(1500).toISOString(),
    rps: 100, p95: 50, p99: 90, errorRate: 0, totalRequests: 1000, ...overrides,
  };
}

function history() {
  return [1, 2, 3, 4, 5].map((index) => makeRun(`baseline-${index}`, {
    startedAt: new Date(index * 1000).toISOString(), finishedAt: new Date(index * 1000 + 500).toISOString(),
    rps: [99, 100, 101, 100, 102][index - 1],
    p95: [50, 51, 49, 50, 50][index - 1],
    p99: [90, 91, 89, 90, 90][index - 1],
  }));
}

test('fingerprint is stable for normalized query ordering and changes for workload settings', () => {
  const a = makeRun('a', { url: 'http://localhost:5050/fixed?z=2&delayMs=50' });
  const b = makeRun('b', { url: 'http://localhost:5050/fixed?delayMs=50&z=2' });
  assert.equal(fingerprintConfig(a).fingerprint, fingerprintConfig(b).fingerprint);
  assert.notEqual(fingerprintConfig(a).fingerprint, fingerprintConfig(makeRun('c', { concurrency: 5 })).fingerprint);
  assert.notEqual(fingerprintConfig(a).fingerprint, fingerprintConfig(makeRun('d', { assertions: { status: 200 } })).fingerprint);
});

test('fewer than three comparable runs returns insufficient_data with exact explanation', () => {
  const result = evaluateRunRegression(makeRun('current'), history().slice(0, 2));
  assert.equal(result.verdict, 'insufficient_data');
  assert.equal(result.baselineCount, 2);
  assert.equal(result.minimumBaselineRuns, 3);
  assert.match(result.reason, /found 2/);
});

test('incompatible workload, target, partial, and demo history are excluded', () => {
  const candidates = [
    ...history().slice(0, 2),
    makeRun('different-concurrency', { concurrency: 10 }),
    makeRun('different-target', { targetId: 'target-2' }),
    makeRun('partial', { partialWorkers: [1] }),
    makeRun('demo', { isDemo: true }),
  ];
  assert.equal(evaluateRunRegression(makeRun('current'), candidates).baselineCount, 2);
});

test('same-distribution run passes and includes median, MAD band, and the actual baseline IDs', () => {
  const result = evaluateRunRegression(makeRun('current'), history());
  assert.equal(result.verdict, 'pass');
  assert.equal(result.baselineCount, 5);
  assert.deepEqual(result.baselineRunIds, ['baseline-5', 'baseline-4', 'baseline-3', 'baseline-2', 'baseline-1']);
  assert.equal(result.metrics.rps.median, 100);
  assert.ok(result.metrics.rps.mad > 0);
  assert.equal(result.metrics.rps.verdict, 'pass');
  assert.ok(result.metrics.rps.band.lower < result.metrics.rps.band.upper);
});

test('a robust outlier does not move the baseline median', () => {
  const candidates = [...history().slice(0, 4), makeRun('old-outlier', { rps: 1 })];
  const result = evaluateRunRegression(makeRun('current'), candidates);
  assert.equal(result.metrics.rps.median, 100);
});

test('regression needs both robust-band violation and Phase 1 minimum change', () => {
  const candidates = history();
  const smallDrift = evaluateRunRegression(makeRun('small', { rps: 98 }), candidates);
  const largeDrop = evaluateRunRegression(makeRun('drop', { rps: 90 }), candidates);
  assert.equal(smallDrift.metrics.rps.verdict, 'pass');
  assert.equal(largeDrop.metrics.rps.verdict, 'regression');
  assert.equal(largeDrop.verdict, 'regression');
  assert.equal(largeDrop.metrics.rps.minimumRelativeChange, REGRESSION_POLICY.minimumRelativeChange.rps);
});

test('latency/error regressions and meaningful improvements have correct direction', () => {
  const candidates = history();
  const slow = evaluateRunRegression(makeRun('slow', { p95: 63, p99: 115, errorRate: 0.02 }), candidates);
  assert.equal(slow.metrics.p95.verdict, 'regression');
  assert.equal(slow.metrics.p99.verdict, 'regression');
  assert.equal(slow.metrics.errorRate.verdict, 'regression');
  const better = evaluateRunRegression(makeRun('better', { rps: 110, p95: 40, p99: 70 }), candidates);
  assert.equal(better.verdict, 'improvement');
});

test('incomplete run cannot be declared passing', () => {
  const result = evaluateRunRegression(makeRun('partial-current', { partialWorkers: [0] }), history());
  assert.equal(result.verdict, 'insufficient_data');
});
