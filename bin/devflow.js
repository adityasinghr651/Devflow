#!/usr/bin/env node
import fs from 'node:fs/promises';
import { parseArgs as parseNodeArgs } from 'node:util';

function parseArgs(args) {
  const parsed = parseNodeArgs({ args, allowPositionals: true, strict: true, options: {
    config: { type: 'string', short: 'c' }, api: { type: 'string' }, token: { type: 'string' },
    wait: { type: 'string' }, json: { type: 'boolean', default: false },
  } });
  return { ...parsed.values, _: parsed.positionals };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (err) { console.error(err.message); process.exitCode = 2; return; }
  if (args._[0] !== 'run' || !args.config || !args.api || !args.token) {
    console.error('Usage: devflow run -c devflow.config.json --api http://localhost:4000/api/v1 --token <token> [--wait 120] [--json]');
    process.exitCode = 2; return;
  }
  let config;
  try { config = JSON.parse(await fs.readFile(args.config, 'utf8')); }
  catch (err) { console.error(`Cannot read config ${args.config}: ${err.message}`); process.exitCode = 2; return; }
  if (typeof config.targetId !== 'string' || !config.targetId.trim() || !Number.isInteger(config.concurrency) || config.concurrency < 1 || !Number.isInteger(config.durationSec) || config.durationSec < 1 || config.durationSec > 3600) {
    console.error('Config must include a non-empty targetId, positive integer concurrency, and durationSec from 1 to 3600.'); process.exitCode = 2; return;
  }
  const waitSeconds = Number(args.wait || 120);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 1) { console.error('--wait must be a positive number of seconds.'); process.exitCode = 2; return; }
  const base = args.api.replace(/\/$/, '');
  const request = async (url, init = {}) => {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${args.token}`, 'Content-Type': 'application/json', ...init.headers } });
    if (!response.ok) throw new Error(`API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  };
  try {
    const created = await request(`${base}/runs`, { method: 'POST', body: JSON.stringify(config) });
    const deadline = Date.now() + waitSeconds * 1000;
    let run = created;
    while (!['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      run = await request(`${base}/runs/${encodeURIComponent(created.id)}`);
    }
    if (!['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) throw new Error(`Timed out waiting for run ${created.id}`);
    const regression = await request(`${base}/runs/${encodeURIComponent(created.id)}/regression`);
    const report = { runId: run.id, status: run.status, totalRequests: run.totalRequests, successCount: run.successCount, failedCount: run.failedCount, assertionFailureCount: run.assertionFailureCount || 0, rps: run.rps, p50: run.p50, p95: run.p95, p99: run.p99, errorRate: run.errorRate, regression };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      const metricLine = key => {
        const metric = regression.metrics[key];
        return metric?.band ? `${key}: ${metric.verdict} (${metric.observed}; band ${metric.band.lower}–${metric.band.upper})` : `${key}: ${metric?.verdict || 'insufficient_data'}`;
      };
      console.log(`DevFlow run ${run.id}: ${run.status}\nRequests: ${report.totalRequests} (${report.successCount} succeeded, ${report.failedCount} failed)\nRPS: ${report.rps} | p95: ${report.p95} ms | p99: ${report.p99} ms | error rate: ${report.errorRate}%\nRegression verdict: ${regression.verdict} (${regression.baselineCount}/${regression.historySize} most recent comparable runs; ${regression.minimumBaselineRuns} minimum required)\n${['rps', 'p95', 'p99', 'errorRate'].map(metricLine).join('\n')}`);
    }
    process.exitCode = run.status === 'completed' && report.failedCount === 0 && report.assertionFailureCount === 0 && regression.verdict !== 'regression' ? 0 : 1;
  } catch (err) { console.error(`DevFlow error: ${err.message}`); process.exitCode = 2; }
}

main();
