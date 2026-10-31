import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMetrics,
  generateMarkdownReport,
  validateBenchmarkData,
  DEFAULT_THRESHOLDS,
} from '../../tools/compare-benchmarks.js';

test('Benchmark Comparator & Regression Suite', async (t) => {
  const baseFixture = {
    version: '1.0',
    benchmarks: [
      {
        concurrency: 1,
        achievedRps: 2000,
        p50: 0.50,
        p95: 1.00,
        p99: 2.00,
        errorRate: 0,
      },
      {
        concurrency: 10,
        achievedRps: 2500,
        p50: 2.00,
        p95: 4.00,
        p99: 8.00,
        errorRate: 0,
      },
    ],
  };

  // 1. No regression scenario
  await t.test('1. No regression: identical or improved performance passes all checks', () => {
    const current = {
      version: '1.0',
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 2050, // +2.5% throughput
          p50: 0.48,        // improved latency
          p95: 0.98,
          p99: 1.95,
          errorRate: 0,
        },
        {
          concurrency: 10,
          achievedRps: 2480, // -0.8% throughput (well within 15% tolerance)
          p50: 2.05,
          p95: 4.10,
          p99: 8.20,
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.passed, true);
    assert.equal(result.failures.length, 0);
    assert.equal(result.comparisons.length, 2);
    assert.equal(result.comparisons[0].status, 'passed');
    assert.equal(result.comparisons[1].status, 'passed');
  });

  // 2. Throughput regression scenario
  await t.test('2. Throughput regression: fails when RPS drop exceeds maxRpsDropPercent', () => {
    const current = {
      version: '1.0',
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 1600, // 20% drop (threshold is 15%)
          p50: 0.50,
          p95: 1.00,
          p99: 2.00,
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].concurrency, 1);
    assert.match(result.failures[0].reasons[0], /Throughput dropped by 20%/);
  });

  // 3. Latency regression scenario
  await t.test('3. Latency regression: fails when p95 increases beyond threshold and noise buffer', () => {
    const current = {
      version: '1.0',
      benchmarks: [
        {
          concurrency: 10,
          achievedRps: 2500,
          p50: 2.00,
          p95: 5.50, // +37.5% increase and +1.5ms absolute (threshold: 25% / 0.5ms)
          p99: 8.00,
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].reasons[0], /p95 latency rose by \+37\.5%/);
  });

  // 4. Latency noise buffer behavior
  await t.test('4. Latency noise buffer: high percentage increase passes if absolute increase is below buffer', () => {
    const microBaseline = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 2000,
          p50: 0.20,
          p95: 0.30,
          p99: 0.50,
          errorRate: 0,
        },
      ],
    };

    const currentWithJitter = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 2000,
          p50: 0.22,
          p95: 0.40, // +33% increase, but only +0.10ms absolute (< minP95AbsoluteDeltaMs of 0.5ms)
          p99: 0.60, // +20% increase (< 35%)
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(microBaseline, currentWithJitter);
    assert.equal(result.passed, true, 'Sub-millisecond jitter below absolute delta threshold must not fail');
  });

  // 5. p99 tail latency regression
  await t.test('5. Tail latency regression: fails when p99 exceeds maxP99IncreasePercent', () => {
    const current = {
      benchmarks: [
        {
          concurrency: 10,
          achievedRps: 2500,
          p50: 2.00,
          p95: 4.20,
          p99: 12.00, // +50% increase and +4.0ms absolute (threshold: 35% / 1.0ms)
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.passed, false);
    assert.match(result.failures[0].reasons[0], /p99 latency rose by \+50%/);
  });

  // 6. Error rate threshold violation
  await t.test('6. Error rate: fails when errorRate exceeds maxErrorRatePercent', () => {
    const current = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 2000,
          p50: 0.50,
          p95: 1.00,
          p99: 2.00,
          errorRate: 1.25, // Limit is 1.0%
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.passed, false);
    assert.match(result.failures[0].reasons[0], /Error rate reached 1\.25%/);
  });

  // 7. Threshold boundary behavior
  await t.test('7. Threshold boundary: exact threshold values pass; marginally beyond fails', () => {
    // Exact threshold boundary: -15.0% RPS drop
    const boundaryCurrent = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 1700, // Exactly -15.0% drop
          p50: 0.50,
          p95: 1.25,        // Exactly +25.0% increase
          p99: 2.70,        // Exactly +35.0% increase
          errorRate: 1.0,   // Exactly 1.0% error rate
        },
      ],
    };

    const boundResult = compareMetrics(baseFixture, boundaryCurrent);
    assert.equal(boundResult.passed, true, 'Exact threshold limits must pass');

    // Marginally beyond threshold: -15.1% RPS drop
    const beyondCurrent = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 1698, // -15.1% drop
          p50: 0.50,
          p95: 1.00,
          p99: 2.00,
          errorRate: 0,
        },
      ],
    };

    const beyondResult = compareMetrics(baseFixture, beyondCurrent);
    assert.equal(beyondResult.passed, false, 'Values exceeding threshold must fail');
  });

  // 8. Missing or unmatched baseline configuration
  await t.test('8. Missing baseline level: marks status as unmatched without crashing', () => {
    const current = {
      benchmarks: [
        {
          concurrency: 50, // Concurrency 50 not in baseFixture
          achievedRps: 1500,
          p50: 5.0,
          p95: 10.0,
          p99: 20.0,
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    assert.equal(result.comparisons[0].status, 'unmatched');
    assert.match(result.comparisons[0].message, /No baseline configuration found matching concurrency 50 VU/);
  });

  // 9. Invalid baseline or benchmark data validation
  await t.test('9. Schema validation: throws meaningful error on missing or malformed data', () => {
    assert.throws(
      () => validateBenchmarkData(null, 'Baseline'),
      /Invalid Baseline data: payload must be a non-null JSON object/
    );

    assert.throws(
      () => validateBenchmarkData({ benchmarks: [] }, 'Current'),
      /Invalid Current data: missing or empty benchmark items array/
    );

    assert.throws(
      () => validateBenchmarkData({ benchmarks: [{ concurrency: 0 }] }, 'Current'),
      /missing valid 'concurrency'/
    );

    assert.throws(
      () => validateBenchmarkData({ benchmarks: [{ concurrency: 1, achievedRps: -5 }] }, 'Current'),
      /missing valid 'achievedRps'/
    );

    assert.throws(
      () => validateBenchmarkData({ benchmarks: [{ concurrency: 1, achievedRps: 1000, p50: 1 }] }, 'Current'),
      /missing required percentile metrics/
    );
  });

  // 10. Markdown report generation format
  await t.test('10. Report generation: renders complete GitHub-Flavored Markdown report', () => {
    const current = {
      benchmarks: [
        {
          concurrency: 1,
          achievedRps: 2000,
          p50: 0.50,
          p95: 1.00,
          p99: 2.00,
          errorRate: 0,
        },
      ],
    };

    const result = compareMetrics(baseFixture, current);
    const md = generateMarkdownReport(result);

    assert.ok(md.includes('## Performance Benchmark Regression Report: PASSED'));
    assert.ok(md.includes('| Concurrency | Metric | Baseline | Current | Delta | Delta % | Threshold Limit | Status |'));
    assert.ok(md.includes('Throughput (RPS)'));
    assert.ok(md.includes('Configured Thresholds'));
    assert.ok(md.includes('Max Throughput Drop:** `-15%`'));
  });
});
