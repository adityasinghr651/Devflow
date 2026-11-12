import { createHash } from 'node:crypto';

export const REGRESSION_POLICY = Object.freeze({
  historySize: 5,
  minimumBaselineRuns: 3,
  confidenceMultiplier: 3,
  minimumRelativeChange: {
    rps: 0.032178, // 3 × Phase 1 one-worker RPS CV (1.0726%).
    p95: 0.193563, // 3 × Phase 1 one-worker p95 CV (6.4521%).
    p99: 0.193563, // p95 is the nearest repeated tail-latency variance measurement.
    errorRate: 0.25,
  },
  errorRateAbsoluteFloor: 0.01, // Percentage points; Phase 1 samples had no failures to estimate error noise.
});

const METRICS = ['rps', 'p95', 'p99', 'errorRate'];
const TERMINAL_QUALITY = run => run.status === 'completed' && !run.isDemo && !(run.partialWorkers?.length) && run.histogramComplete !== false;
const observedValue = run => Object.fromEntries(METRICS.map(metric => {
  const value = run[metric];
  return [metric, value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null];
}));

function normalizePath(run) {
  try {
    const url = new URL(run.url);
    url.searchParams.sort();
    return `${url.pathname}${url.search}`;
  } catch {
    return String(run.url || '');
  }
}

export function fingerprintConfig(run) {
  const workload = {
    targetId: run.targetId,
    method: String(run.method || 'GET').toUpperCase(),
    path: normalizePath(run),
    concurrency: Number(run.concurrency),
    durationSec: Number(run.durationSec),
    profile: run.profile || 'fixed',
    stages: run.profile === 'stages' ? (run.stages || []) : [],
    engine: run.engine || run.environmentMetadata?.engine || 'node',
    workerCount: Number(run.workerCount || run.environmentMetadata?.workerCount || 1),
    assertions: run.assertions || null,
  };
  const canonical = JSON.stringify(workload);
  return {
    fingerprint: createHash('sha256').update(canonical).digest('hex'),
    workload,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function metricVerdict(metric, observed, baselineRuns, minimumBaselineRuns) {
  const values = baselineRuns.map(run => run[metric])
    .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (values.length < minimumBaselineRuns) return { verdict: 'insufficient_data', observed };
  if (observed === null || observed === undefined || !Number.isFinite(Number(observed))) return { verdict: 'insufficient_data', observed: null };
  observed = Number(observed);
  const center = median(values);
  const mad = median(values.map(value => Math.abs(value - center)));
  const robustSpread = 1.4826 * mad;
  const statisticalBand = REGRESSION_POLICY.confidenceMultiplier * robustSpread;
  const relativeMinimum = Math.abs(center) * REGRESSION_POLICY.minimumRelativeChange[metric];
  const absoluteMinimum = metric === 'errorRate' ? REGRESSION_POLICY.errorRateAbsoluteFloor : 0;
  const threshold = Math.max(statisticalBand, relativeMinimum, absoluteMinimum);
  const lower = center - threshold;
  const upper = center + threshold;
  let verdict = 'pass';
  if (metric === 'rps') {
    if (observed < lower) verdict = 'regression';
    else if (observed > upper) verdict = 'improvement';
  } else {
    if (observed > upper) verdict = 'regression';
    else if (observed < lower) verdict = 'improvement';
  }
  return {
    verdict,
    observed,
    median: Number(center.toFixed(6)),
    mad: Number(mad.toFixed(6)),
    scaledMad: Number(robustSpread.toFixed(6)),
    statisticalBand: Number(statisticalBand.toFixed(6)),
    minimumRelativeChange: REGRESSION_POLICY.minimumRelativeChange[metric],
    absoluteMinimumChange: absoluteMinimum,
    threshold: Number(threshold.toFixed(6)),
    band: { lower: Number(lower.toFixed(6)), upper: Number(upper.toFixed(6)) },
    baselineValues: values,
  };
}

export function evaluateRunRegression(run, allRuns, options = {}) {
  const historySize = options.historySize ?? REGRESSION_POLICY.historySize;
  const minimumBaselineRuns = options.minimumBaselineRuns ?? REGRESSION_POLICY.minimumBaselineRuns;
  const config = fingerprintConfig(run);
  const baselineRuns = allRuns
    .filter(candidate => candidate.id !== run.id && candidate.targetId === run.targetId && TERMINAL_QUALITY(candidate))
    .filter(candidate => fingerprintConfig(candidate).fingerprint === config.fingerprint)
    .sort((a, b) => Date.parse(b.finishedAt || b.startedAt || b.createdAt) - Date.parse(a.finishedAt || a.startedAt || a.createdAt))
    .slice(0, historySize);
  const baselineRunIds = baselineRuns.map(candidate => candidate.id);
  const targetHistory = allRuns.filter(candidate => candidate.id !== run.id && candidate.targetId === run.targetId && TERMINAL_QUALITY(candidate));
  const mismatchedRunCount = targetHistory.filter(candidate => fingerprintConfig(candidate).fingerprint !== config.fingerprint).length;
  if (!TERMINAL_QUALITY(run)) {
    return {
      runId: run.id,
      targetId: run.targetId,
      fingerprint: config.fingerprint,
      workload: config.workload,
      verdict: 'insufficient_data',
      reason: 'Only complete, non-demo runs with complete worker histograms can be evaluated.',
      baselineCount: baselineRuns.length,
      historySize,
      minimumBaselineRuns,
      baselineRunIds,
      mismatchedRunCount,
      metrics: Object.fromEntries(METRICS.map(metric => [metric, { verdict: 'insufficient_data', observed: observedValue(run)[metric] }]))
    };
  }
  if (baselineRuns.length < minimumBaselineRuns) {
    return {
      runId: run.id,
      targetId: run.targetId,
      fingerprint: config.fingerprint,
      workload: config.workload,
      verdict: 'insufficient_data',
      reason: `Need ${minimumBaselineRuns} completed comparable baseline runs; found ${baselineRuns.length}.${mismatchedRunCount ? ` ${mismatchedRunCount} completed run(s) for this target have a different workload fingerprint.` : ''}`,
      baselineCount: baselineRuns.length,
      historySize,
      minimumBaselineRuns,
      baselineRunIds,
      mismatchedRunCount,
      metrics: Object.fromEntries(METRICS.map(metric => [metric, { verdict: 'insufficient_data', observed: observedValue(run)[metric] }]))
    };
  }
  const metrics = Object.fromEntries(METRICS.map(metric => {
    return [metric, metricVerdict(metric, observedValue(run)[metric], baselineRuns, minimumBaselineRuns)];
  }));
  const values = Object.values(metrics).map(metric => metric.verdict);
  const verdict = values.includes('insufficient_data') ? 'insufficient_data' : values.includes('regression') ? 'regression' : values.includes('improvement') ? 'improvement' : 'pass';
  return {
    runId: run.id,
    targetId: run.targetId,
    fingerprint: config.fingerprint,
    workload: config.workload,
    verdict,
    reason: 'A regression requires a 3× scaled-MAD band violation and the metric-specific minimum change.',
    baselineCount: baselineRuns.length,
    historySize,
    minimumBaselineRuns,
    baselineRunIds,
    mismatchedRunCount,
    metrics,
  };
}
