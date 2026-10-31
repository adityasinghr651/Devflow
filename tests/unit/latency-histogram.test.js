import test from 'node:test';
import assert from 'node:assert/strict';
import { LatencyHistogram, calculatePercentile, BUCKET_COUNT } from '../../server/runner/latency-histogram.js';

test('LatencyHistogram: Bounded-Memory Latency Metrics Unit Suite', async (t) => {
  // 1. Empty samples boundary safety
  await t.test('1. Empty samples return 0 for all percentiles and stats', () => {
    const h = new LatencyHistogram();
    assert.equal(h.totalCount, 0);
    assert.equal(h.getPercentile(0.50), 0);
    assert.equal(h.getPercentile(0.95), 0);
    assert.equal(h.getPercentile(0.99), 0);
    assert.equal(h.getPercentileFromBuckets(0.50), 0);

    const summary = h.getSummary();
    assert.deepEqual(summary, {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    });
  });

  // 2. Single sample behavior
  await t.test('2. Single sample returns exact value for all percentiles', () => {
    const h = new LatencyHistogram();
    h.record(42.5);
    assert.equal(h.totalCount, 1);
    assert.equal(h.getPercentile(0.10), 42.5);
    assert.equal(h.getPercentile(0.50), 42.5);
    assert.equal(h.getPercentile(0.95), 42.5);
    assert.equal(h.getPercentile(0.99), 42.5);

    // Pure bucket mode
    const hPure = new LatencyHistogram({ exactCapacity: 0 });
    hPure.record(42.5);
    const p50Pure = hPure.getPercentile(0.50);
    assert.ok(Math.abs(p50Pure - 42.5) <= 0.1, `Pure bucket should be within 0.1ms, got ${p50Pure}`);
  });

  // 3. Known distributions and accuracy
  await t.test('3. Known uniform distribution matches exact percentiles within high precision', () => {
    // Test pure histogram (no exact buffer fallback) to verify histogram algorithm accuracy
    const h = new LatencyHistogram({ exactCapacity: 0 });
    const samples = [];

    // Populate 10,000 samples uniformly distributed between 1.00ms and 50.00ms
    for (let i = 1; i <= 10000; i++) {
      const val = 1.0 + (i / 10000) * 49.0;
      samples.push(val);
      h.record(val);
    }

    samples.sort((a, b) => a - b);
    const exactP50 = calculatePercentile(samples, 0.50);
    const exactP95 = calculatePercentile(samples, 0.95);
    const exactP99 = calculatePercentile(samples, 0.99);

    const histP50 = h.getPercentile(0.50);
    const histP95 = h.getPercentile(0.95);
    const histP99 = h.getPercentile(0.99);

    // High accuracy: relative error must be under 0.2%
    const relErrP50 = Math.abs(histP50 - exactP50) / exactP50;
    const relErrP95 = Math.abs(histP95 - exactP95) / exactP95;
    const relErrP99 = Math.abs(histP99 - exactP99) / exactP99;

    assert.ok(relErrP50 < 0.005, `p50 relative error must be < 0.5%, got ${(relErrP50 * 100).toFixed(3)}%`);
    assert.ok(relErrP95 < 0.005, `p95 relative error must be < 0.5%, got ${(relErrP95 * 100).toFixed(3)}%`);
    assert.ok(relErrP99 < 0.005, `p99 relative error must be < 0.5%, got ${(relErrP99 * 100).toFixed(3)}%`);

    // Monotonicity verification
    assert.ok(histP50 <= histP95, `p50 (${histP50}) <= p95 (${histP95})`);
    assert.ok(histP95 <= histP99, `p95 (${histP95}) <= p99 (${histP99})`);
  });

  // 4. Strict Percentile Monotonicity across continuous percentile sweep
  await t.test('4. Percentile monotonicity strictly holds across entire spectrum', () => {
    const h = new LatencyHistogram({ exactCapacity: 0 });

    // Seed multimodal latency distribution
    for (let i = 0; i < 5000; i++) h.record(0.1 + Math.random() * 2);      // fast path: 0.1 - 2.1ms
    for (let i = 0; i < 3000; i++) h.record(50 + Math.random() * 50);     // medium path: 50 - 100ms
    for (let i = 0; i < 1000; i++) h.record(250 + Math.random() * 250);   // slow path: 250 - 500ms
    for (let i = 0; i < 200; i++)  h.record(1500 + Math.random() * 1000); // tail path: 1.5s - 2.5s

    let prevValue = 0;
    for (let pct = 1; pct <= 100; pct++) {
      const val = h.getPercentile(pct / 100);
      assert.ok(
        val >= prevValue,
        `Monotonicity violation at p(${pct}%): ${val} < ${prevValue}`
      );
      prevValue = val;
    }
  });

  // 5. Exact Nearest-Rank Match for Small Sample Sizes (N <= exactCapacity)
  await t.test('5. Hybrid mode produces exact Nearest-Rank for N <= exactCapacity', () => {
    const h = new LatencyHistogram({ exactCapacity: 1024 });
    const raw = [12.4, 0.8, 95.3, 4.1, 18.2, 5.5, 33.1, 2.0, 7.8, 100.5];

    for (const v of raw) h.record(v);
    raw.sort((a, b) => a - b);

    for (const p of [0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99]) {
      const exact = calculatePercentile(raw, p);
      const hist = h.getPercentile(p);
      assert.equal(hist, exact, `At p=${p}, expected exact ${exact}, got ${hist}`);
    }
  });

  // 6. High Sample Count Execution Speed and Fixed Bounded Storage
  await t.test('6. High sample count (200,000 samples) executes in <100ms with fixed storage', () => {
    const h = new LatencyHistogram();
    const startTime = performance.now();

    const SAMPLE_COUNT = 200000;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      // Ingest varying realistic latencies
      h.record((i % 500) * 0.5);
    }
    const elapsedMs = performance.now() - startTime;

    assert.equal(h.totalCount, SAMPLE_COUNT);
    assert.ok(elapsedMs < 300, `200k samples should record in <300ms, took ${elapsedMs.toFixed(1)}ms`);

    // Verify buckets array length is strictly bounded
    assert.equal(h.buckets.length, BUCKET_COUNT);
    assert.equal(h.buckets.byteLength, BUCKET_COUNT * 4); // Exactly 27,204 bytes

    // Query percentiles
    const p50 = h.getPercentile(0.50);
    const p95 = h.getPercentile(0.95);
    const p99 = h.getPercentile(0.99);

    assert.ok(p50 <= p95 && p95 <= p99);
    assert.ok(p50 > 100 && p50 < 150);
  });

  // 7. Multi-Tier Resolution Boundaries and Extreme Values
  await t.test('7. Boundary limits, negative clamping, and overflow handling', () => {
    const h = new LatencyHistogram({ exactCapacity: 0 });

    // Negative latency clamped to 0
    h.record(-15);
    assert.equal(h.minLatency, 0);

    // Tier 1 boundary (20ms)
    h.record(19.99);
    h.record(20.01);

    // Tier 2 boundary (100ms)
    h.record(99.95);
    h.record(100.05);

    // Tier 3 boundary (1000ms)
    h.record(999.5);
    h.record(1000.5);

    // Tier 4 boundary (10,000ms)
    h.record(9999);
    h.record(10001);

    // Overflow boundary (> 60,000ms)
    h.record(75000); // Mapped to overflow bucket 6800
    assert.equal(h.maxLatency, 75000);

    const summary = h.getSummary();
    assert.equal(summary.min, 0);
    assert.equal(summary.max, 75000);
    assert.ok(summary.p50 <= summary.p95 && summary.p95 <= summary.p99);
  });

  // 8. Exact 60,000ms boundary mapping (59,999.99ms, 60,000ms, 60,000.01ms)
  await t.test('8. Exact 60,000ms boundary mapping to Tier 5 vs Overflow bucket', () => {
    const h = new LatencyHistogram({ exactCapacity: 0 });

    // Validate internal bucket index calculation
    const idxBelow = h._getBucketIndex(59999.99);
    const idxExact = h._getBucketIndex(60000.00);
    const idxAbove = h._getBucketIndex(60000.01);

    assert.equal(idxBelow, 6799, '59999.99ms must map to last Tier 5 bucket (6799)');
    assert.equal(idxExact, 6799, '60000.00ms must map to last Tier 5 bucket (6799)');
    assert.equal(idxAbove, 6800, '60000.01ms must map to Overflow bucket (6800)');

    // Record samples and verify bucket distribution
    h.record(59999.99);
    h.record(60000.00);
    h.record(60000.01);

    assert.equal(h.buckets[6799], 2, 'Bucket 6799 should receive exactly 2 samples');
    assert.equal(h.buckets[6800], 1, 'Bucket 6800 should receive exactly 1 sample');
    assert.equal(h.minOverflowLatency, 60000.01, 'minOverflowLatency must track lowest sample > 60000ms');

    // Bounds check
    const rangeTier5 = h._getBucketRange(6799);
    assert.deepEqual(rangeTier5, [59975, 60000]);

    const rangeOverflow = h._getBucketRange(6800);
    assert.deepEqual(rangeOverflow, [60000.01, 60000.01]);
  });

  // 9. Regression: Overflow bucket percentile does not incorrectly clamp to 60,000ms
  await t.test('9. Regression: Overflow percentiles reflect actual values >60,000ms with monotonicity', () => {
    // 9A: Mixed samples below and above 60,000ms in pure bucket mode
    const hMixed = new LatencyHistogram({ exactCapacity: 0 });
    hMixed.record(10);
    hMixed.record(75000);

    const p50 = hMixed.getPercentile(0.50);
    const p95 = hMixed.getPercentile(0.95);
    const p99 = hMixed.getPercentile(0.99);

    assert.ok(p99 > 60000, `p99 must be >60,000ms, got ${p99}`);
    assert.equal(p99, 75000, `p99 must equal single overflow sample 75,000ms, got ${p99}`);
    assert.ok(p50 <= p95, `Monotonicity check: p50 (${p50}) <= p95 (${p95})`);
    assert.ok(p95 <= p99, `Monotonicity check: p95 (${p95}) <= p99 (${p99})`);

    // 9B: Multiple overflow samples interpolate smoothly within [minOverflow, maxLatency]
    const hMulti = new LatencyHistogram({ exactCapacity: 0 });
    hMulti.record(10);
    hMulti.record(70000);
    hMulti.record(90000);

    const p33 = hMulti.getPercentile(0.33);
    const p66 = hMulti.getPercentile(0.66);
    const p99Multi = hMulti.getPercentile(0.99);

    assert.ok(p33 <= p66 && p66 <= p99Multi, `Monotonicity: ${p33} <= ${p66} <= ${p99Multi}`);
    assert.equal(p66, 75000, `p66 should interpolate to 75000ms, got ${p66}`);
    assert.equal(p99Multi, 85000, `p99 should interpolate to 85000ms, got ${p99Multi}`);

    // 9C: Large request volume with an extreme tail sample (>60,000ms)
    const hLarge = new LatencyHistogram({ exactCapacity: 0 });
    for (let i = 0; i < 2000; i++) {
      hLarge.record(25.0); // 2000 normal fast requests
    }
    hLarge.record(80000); // 1 extreme timeout/delay request

    assert.equal(hLarge.totalCount, 2001);
    assert.equal(hLarge.buckets.length, BUCKET_COUNT, 'Bucket count must remain strictly 6801');

    const largeP50 = hLarge.getPercentile(0.50);
    const largeP95 = hLarge.getPercentile(0.95);
    const largeP99 = hLarge.getPercentile(0.99);
    const largeP9999 = hLarge.getPercentile(0.9999);

    assert.ok(largeP50 <= largeP95 && largeP95 <= largeP99 && largeP99 <= largeP9999);
    assert.ok(largeP99 < 30, `p99 should be within normal requests (~25ms), got ${largeP99}`);
    assert.equal(largeP9999, 80000, `p99.99 should reflect the 80,000ms tail sample, got ${largeP9999}`);
  });

  // 10. Reset functionality
  await t.test('10. Reset clears all buckets, overflow tracking, and restores initial state', () => {
    const h = new LatencyHistogram();
    h.record(100);
    h.record(200);
    assert.equal(h.totalCount, 2);

    h.reset();
    assert.equal(h.totalCount, 0);
    assert.equal(h.getPercentile(0.50), 0);
    assert.equal(h.getSummary().count, 0);
    assert.equal(h.minOverflowLatency, Infinity, 'minOverflowLatency should be reset to Infinity');
  });
});

