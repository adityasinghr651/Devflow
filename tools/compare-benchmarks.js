/**
 * CI/CD Benchmark Comparison Engine & Report Generator.
 *
 * Compares current benchmark results against an established baseline,
 * evaluates configurable performance regression thresholds (RPS, latency percentiles, error rate),
 * and generates human-readable Markdown reports suitable for GitHub Actions step summaries.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_THRESHOLDS = {
  maxRpsDropPercent: 15,          // Fail if achieved RPS drops by > 15%
  maxP95IncreasePercent: 25,      // Fail if p95 latency increases by > 25%
  minP95AbsoluteDeltaMs: 0.5,     // ...and p95 increase is at least 0.5ms absolute
  maxP99IncreasePercent: 35,      // Fail if p99 latency increases by > 35%
  minP99AbsoluteDeltaMs: 1.0,     // ...and p99 increase is at least 1.0ms absolute
  maxErrorRatePercent: 1.0,       // Fail if error rate exceeds 1.0%
};

/**
 * Validates the structure and required fields of a benchmark dataset.
 */
export function validateBenchmarkData(data, label = 'Benchmark') {
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid ${label} data: payload must be a non-null JSON object.`);
  }

  const items = Array.isArray(data.benchmarks)
    ? data.benchmarks
    : (Array.isArray(data.measured) ? data.measured : null);

  if (!items || !items.length) {
    throw new Error(`Invalid ${label} data: missing or empty benchmark items array ('benchmarks' or 'measured').`);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item.concurrency !== 'number' || item.concurrency < 1) {
      throw new Error(`Invalid ${label} data item at index ${i}: missing valid 'concurrency'.`);
    }
    if (typeof item.achievedRps !== 'number' || item.achievedRps < 0) {
      throw new Error(`Invalid ${label} data item at index ${i}: missing valid 'achievedRps'.`);
    }
    if (typeof item.p50 !== 'number' || typeof item.p95 !== 'number' || typeof item.p99 !== 'number') {
      throw new Error(`Invalid ${label} data item at index ${i}: missing required percentile metrics (p50, p95, p99).`);
    }
  }

  return items;
}

/**
 * Compares current benchmark measurements against baseline metrics.
 */
export function compareMetrics(baselineData, currentData, customThresholds = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  const baselineItems = validateBenchmarkData(baselineData, 'Baseline');
  const currentItems = validateBenchmarkData(currentData, 'Current');

  const comparisons = [];
  const failures = [];

  for (const current of currentItems) {
    const baseline = baselineItems.find(b => b.concurrency === current.concurrency);
    if (!baseline) {
      comparisons.push({
        concurrency: current.concurrency,
        status: 'unmatched',
        message: `No baseline configuration found matching concurrency ${current.concurrency} VU.`,
        current,
      });
      continue;
    }

    const rpsDelta = Number((current.achievedRps - baseline.achievedRps).toFixed(2));
    const rpsDeltaPct = baseline.achievedRps > 0
      ? Number(((rpsDelta / baseline.achievedRps) * 100).toFixed(2))
      : 0;

    const p50Delta = Number((current.p50 - baseline.p50).toFixed(2));
    const p50DeltaPct = baseline.p50 > 0
      ? Number(((p50Delta / baseline.p50) * 100).toFixed(2))
      : 0;

    const p95Delta = Number((current.p95 - baseline.p95).toFixed(2));
    const p95DeltaPct = baseline.p95 > 0
      ? Number(((p95Delta / baseline.p95) * 100).toFixed(2))
      : 0;

    const p99Delta = Number((current.p99 - baseline.p99).toFixed(2));
    const p99DeltaPct = baseline.p99 > 0
      ? Number(((p99Delta / baseline.p99) * 100).toFixed(2))
      : 0;

    const itemFailures = [];

    // 1. Throughput check (fail on significant drop)
    if (rpsDeltaPct < -thresholds.maxRpsDropPercent) {
      itemFailures.push(
        `Throughput dropped by ${Math.abs(rpsDeltaPct)}% (limit: -${thresholds.maxRpsDropPercent}%)`
      );
    }

    // 2. p95 Latency check (fail on significant increase exceeding noise buffer)
    if (p95DeltaPct > thresholds.maxP95IncreasePercent && p95Delta >= thresholds.minP95AbsoluteDeltaMs) {
      itemFailures.push(
        `p95 latency rose by +${p95DeltaPct}% (+${p95Delta}ms, limit: +${thresholds.maxP95IncreasePercent}% / +${thresholds.minP95AbsoluteDeltaMs}ms)`
      );
    }

    // 3. p99 Latency check (fail on tail spike exceeding noise buffer)
    if (p99DeltaPct > thresholds.maxP99IncreasePercent && p99Delta >= thresholds.minP99AbsoluteDeltaMs) {
      itemFailures.push(
        `p99 latency rose by +${p99DeltaPct}% (+${p99Delta}ms, limit: +${thresholds.maxP99IncreasePercent}% / +${thresholds.minP99AbsoluteDeltaMs}ms)`
      );
    }

    // 4. Error rate check
    if (current.errorRate > thresholds.maxErrorRatePercent) {
      itemFailures.push(
        `Error rate reached ${current.errorRate}% (limit: ${thresholds.maxErrorRatePercent}%)`
      );
    }

    const passed = itemFailures.length === 0;
    if (!passed) {
      failures.push({
        concurrency: current.concurrency,
        reasons: itemFailures,
      });
    }

    comparisons.push({
      concurrency: current.concurrency,
      status: passed ? 'passed' : 'failed',
      failures: itemFailures,
      baseline: {
        rps: baseline.achievedRps,
        p50: baseline.p50,
        p95: baseline.p95,
        p99: baseline.p99,
        errorRate: baseline.errorRate || 0,
      },
      current: {
        rps: current.achievedRps,
        p50: current.p50,
        p95: current.p95,
        p99: current.p99,
        errorRate: current.errorRate || 0,
      },
      deltas: {
        rpsDelta,
        rpsDeltaPct,
        p50Delta,
        p50DeltaPct,
        p95Delta,
        p95DeltaPct,
        p99Delta,
        p99DeltaPct,
      },
    });
  }

  return {
    passed: failures.length === 0,
    timestamp: new Date().toISOString(),
    thresholds,
    comparisons,
    failures,
  };
}

/**
 * Renders the comparison results into a GitHub-Flavored Markdown report.
 */
export function generateMarkdownReport(result) {
  const lines = [];
  const statusEmoji = result.passed ? 'PASSED' : 'FAILED';

  lines.push(`## Performance Benchmark Regression Report: ${statusEmoji}`);
  lines.push(`**Timestamp:** \`${result.timestamp}\` | **Overall Status:** **${result.passed ? 'PASSED' : 'FAILED'}**\n`);

  if (!result.passed) {
    lines.push(`> [!WARNING]`);
    lines.push(`> **Performance Regression Detected!** One or more metrics violated configured thresholds.`);
    for (const f of result.failures) {
      lines.push(`> - **${f.concurrency} VU:** ${f.reasons.join('; ')}`);
    }
    lines.push('');
  } else {
    lines.push(`> [!NOTE]`);
    lines.push(`> All benchmark metrics remained within configured regression tolerance thresholds.`);
    lines.push('');
  }

  // Summary Table
  lines.push(`### Metrics Comparison`);
  lines.push(`| Concurrency | Metric | Baseline | Current | Delta | Delta % | Threshold Limit | Status |`);
  lines.push(`| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`);

  for (const c of result.comparisons) {
    if (c.status === 'unmatched') {
      lines.push(`| ${c.concurrency} VU | N/A | Missing | Present | N/A | N/A | N/A | UNMATCHED |`);
      continue;
    }

    const { baseline, current, deltas } = c;

    // RPS row
    const rpsStatus = deltas.rpsDeltaPct < -result.thresholds.maxRpsDropPercent ? 'FAIL' : 'PASS';
    const rpsDeltaSign = deltas.rpsDelta >= 0 ? `+${deltas.rpsDelta}` : `${deltas.rpsDelta}`;
    const rpsPctSign = deltas.rpsDeltaPct >= 0 ? `+${deltas.rpsDeltaPct}%` : `${deltas.rpsDeltaPct}%`;
    lines.push(`| **${c.concurrency} VU** | Throughput (RPS) | ${baseline.rps} | ${current.rps} | ${rpsDeltaSign} | ${rpsPctSign} | Max Drop -${result.thresholds.maxRpsDropPercent}% | **${rpsStatus}** |`);

    // p50 row
    const p50DeltaSign = deltas.p50Delta >= 0 ? `+${deltas.p50Delta}ms` : `${deltas.p50Delta}ms`;
    const p50PctSign = deltas.p50DeltaPct >= 0 ? `+${deltas.p50DeltaPct}%` : `${deltas.p50DeltaPct}%`;
    lines.push(`| | Latency p50 | ${baseline.p50}ms | ${current.p50}ms | ${p50DeltaSign} | ${p50PctSign} | Informational | PASS |`);

    // p95 row
    const p95Violated = deltas.p95DeltaPct > result.thresholds.maxP95IncreasePercent && deltas.p95Delta >= result.thresholds.minP95AbsoluteDeltaMs;
    const p95Status = p95Violated ? 'FAIL' : 'PASS';
    const p95DeltaSign = deltas.p95Delta >= 0 ? `+${deltas.p95Delta}ms` : `${deltas.p95Delta}ms`;
    const p95PctSign = deltas.p95DeltaPct >= 0 ? `+${deltas.p95DeltaPct}%` : `${deltas.p95DeltaPct}%`;
    lines.push(`| | Latency p95 | ${baseline.p95}ms | ${current.p95}ms | ${p95DeltaSign} | ${p95PctSign} | Max Increase +${result.thresholds.maxP95IncreasePercent}% | **${p95Status}** |`);

    // p99 row
    const p99Violated = deltas.p99DeltaPct > result.thresholds.maxP99IncreasePercent && deltas.p99Delta >= result.thresholds.minP99AbsoluteDeltaMs;
    const p99Status = p99Violated ? 'FAIL' : 'PASS';
    const p99DeltaSign = deltas.p99Delta >= 0 ? `+${deltas.p99Delta}ms` : `${deltas.p99Delta}ms`;
    const p99PctSign = deltas.p99DeltaPct >= 0 ? `+${deltas.p99DeltaPct}%` : `${deltas.p99DeltaPct}%`;
    lines.push(`| | Latency p99 | ${baseline.p99}ms | ${current.p99}ms | ${p99DeltaSign} | ${p99PctSign} | Max Increase +${result.thresholds.maxP99IncreasePercent}% | **${p99Status}** |`);

    // Error Rate row
    const errStatus = current.errorRate > result.thresholds.maxErrorRatePercent ? 'FAIL' : 'PASS';
    lines.push(`| | Error Rate | ${baseline.errorRate}% | ${current.errorRate}% | ${(current.errorRate - baseline.errorRate).toFixed(2)}% | N/A | Max ${result.thresholds.maxErrorRatePercent}% | **${errStatus}** |`);
  }

  lines.push('\n### Configured Thresholds');
  lines.push(`- **Max Throughput Drop:** \`-${result.thresholds.maxRpsDropPercent}%\``);
  lines.push(`- **Max p95 Latency Increase:** \`+${result.thresholds.maxP95IncreasePercent}%\` (with \`>= ${result.thresholds.minP95AbsoluteDeltaMs}ms\` absolute noise buffer)`);
  lines.push(`- **Max p99 Latency Increase:** \`+${result.thresholds.maxP99IncreasePercent}%\` (with \`>= ${result.thresholds.minP99AbsoluteDeltaMs}ms\` absolute noise buffer)`);
  lines.push(`- **Max Error Rate:** \`${result.thresholds.maxErrorRatePercent}%\``);

  return lines.join('\n');
}

/**
 * Main CLI execution for standalone and CI integration.
 */
async function main() {
  const args = process.argv.slice(2);
  let baselinePath = 'benchmarks/baseline.json';
  let currentPath = 'data/ci-benchmark.json';
  let reportPath = 'data/benchmark-report.md';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline' && args[i + 1]) baselinePath = args[++i];
    else if (args[i] === '--current' && args[i + 1]) currentPath = args[++i];
    else if (args[i] === '--report' && args[i + 1]) reportPath = args[++i];
  }

  console.log(`[Comparator] Loading baseline: ${baselinePath}`);
  console.log(`[Comparator] Loading current:  ${currentPath}`);

  let baselineData;
  let currentData;

  try {
    const rawBaseline = await fs.readFile(path.resolve(baselinePath), 'utf8');
    baselineData = JSON.parse(rawBaseline);
  } catch (err) {
    console.error(`[Comparator Error] Failed to read baseline from ${baselinePath}:`, err.message);
    process.exit(1);
  }

  try {
    const rawCurrent = await fs.readFile(path.resolve(currentPath), 'utf8');
    currentData = JSON.parse(rawCurrent);
  } catch (err) {
    console.error(`[Comparator Error] Failed to read current benchmark from ${currentPath}:`, err.message);
    process.exit(1);
  }

  let result;
  try {
    result = compareMetrics(baselineData, currentData);
  } catch (err) {
    console.error(`[Comparator Error] Validation failed:`, err.message);
    process.exit(1);
  }

  const markdownReport = generateMarkdownReport(result);

  // Write report to file
  await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await fs.writeFile(path.resolve(reportPath), markdownReport, 'utf8');
  console.log(`[Comparator] Saved report to: ${reportPath}`);

  // Write to GitHub Step Summary if running in Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${markdownReport}\n`, 'utf8');
      console.log(`[Comparator] Appended report to GITHUB_STEP_SUMMARY`);
    } catch (err) {
      console.warn(`[Comparator Warning] Could not write to GITHUB_STEP_SUMMARY:`, err.message);
    }
  }

  // Console output
  console.log('\n' + '='.repeat(80));
  console.log(` BENCHMARK COMPARISON RESULT: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log('='.repeat(80));
  for (const c of result.comparisons) {
    if (c.status === 'unmatched') {
      console.log(`- ${c.concurrency} VU: UNMATCHED (No baseline found)`);
      continue;
    }
    const rpsStr = `RPS: ${c.baseline.rps} -> ${c.current.rps} (${c.deltas.rpsDeltaPct >= 0 ? '+' : ''}${c.deltas.rpsDeltaPct}%)`;
    const p95Str = `p95: ${c.baseline.p95}ms -> ${c.current.p95}ms (${c.deltas.p95DeltaPct >= 0 ? '+' : ''}${c.deltas.p95DeltaPct}%)`;
    const statusStr = c.status === 'passed' ? '[PASS]' : '[FAIL]';
    console.log(`- ${c.concurrency} VU: ${statusStr} | ${rpsStr} | ${p95Str}`);
    if (c.failures && c.failures.length) {
      for (const r of c.failures) {
        console.log(`    * ${r}`);
      }
    }
  }
  console.log('='.repeat(80));

  if (!result.passed) {
    console.error(`\n[Comparator] Performance regression threshold exceeded. Failing run.`);
    process.exit(1);
  }

  console.log(`\n[Comparator] All metrics passed performance regression checks.`);
  process.exit(0);
}

// Auto-run if executed as main CLI script
if (process.argv[1] && process.argv[1].endsWith('compare-benchmarks.js')) {
  main().catch(err => {
    console.error('[Comparator Fatal Error]', err);
    process.exit(1);
  });
}
