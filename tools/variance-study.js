import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTestTargetServer, TARGET_CONFIG } from './test-target.js';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const repetitions = Math.max(10, Number(process.env.VARIANCE_REPETITIONS || 10));
const durationSec = 1;
const concurrency = 4;
const delayMs = 50;

function gitValue(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(values.length - 1, 1);
  const standardDeviation = Math.sqrt(variance);
  return {
    mean: Number(mean.toFixed(4)),
    standardDeviation: Number(standardDeviation.toFixed(4)),
    coefficientOfVariation: mean === 0 ? null : Number((standardDeviation / Math.abs(mean)).toFixed(6)),
  };
}

function percentile(sortedValues, fraction) {
  const index = Math.max(0, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues[index];
}

async function runOne(storage, runner, targetUrl, workerCount, sampleIndex) {
  const run = {
    id: randomUUID(),
    userId: 'variance-study',
    targetId: 'variance-target',
    targetName: 'Controlled loopback delay target',
    url: `${targetUrl}/fixed?delayMs=${delayMs}`,
    method: 'GET',
    concurrency,
    durationSec,
    profile: 'fixed',
    stages: [],
    headers: {},
    body: null,
    timeoutMs: 2000,
    workerCount,
    status: 'queued',
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    successCount: 0,
    failedCount: 0,
    rps: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    errorRate: 0,
    statusCodes: {},
  };
  await storage.createRun(run);
  await runner.enqueueRun(run);

  const deadline = Date.now() + durationSec * 1000 + 10000;
  while (Date.now() < deadline) {
    const latest = await storage.getRunById(run.id);
    if (latest && ['completed', 'failed', 'cancelled', 'timed_out'].includes(latest.status)) {
      if (latest.status !== 'completed') {
        throw new Error(`workerCount=${workerCount}, sample=${sampleIndex} ended ${latest.status}: ${latest.error || 'no error detail'}`);
      }
      return {
        sample: sampleIndex,
        runId: run.id,
        status: latest.status,
        totalRequests: latest.totalRequests,
        successCount: latest.successCount,
        failedCount: latest.failedCount,
        rps: latest.rps,
        p50: latest.p50,
        p95: latest.p95,
        p99: latest.p99,
        errorRate: latest.errorRate,
        measurementWindowSec: latest.measurementWindowSec,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  await runner.cancelRun(run.id).catch(() => {});
  throw new Error(`Timed out waiting for workerCount=${workerCount}, sample=${sampleIndex}`);
}

async function main() {
  process.env.RUNNER_ENGINE = 'node';
  const server = createTestTargetServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, TARGET_CONFIG.host, resolve);
  });
  const targetUrl = `http://${TARGET_CONFIG.host}:${server.address().port}`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-variance-study-'));
  const storage = new JsonStorage(tempDir);
  await storage.init();
  const runner = new RunnerManager(storage);
  const samples = [];

  try {
    for (const workerCount of [1, 2]) {
      for (let sample = 1; sample <= repetitions; sample++) {
        const result = await runOne(storage, runner, targetUrl, workerCount, sample);
        samples.push({ workerCount, ...result });
        console.log(`workerCount=${workerCount} sample=${sample}/${repetitions} requests=${result.totalRequests} rps=${result.rps} p50=${result.p50}ms p95=${result.p95}ms`);
      }
    }

    const byWorkerCount = {};
    for (const workerCount of [1, 2]) {
      const group = samples.filter(sample => sample.workerCount === workerCount);
      const rps = group.map(sample => sample.rps);
      const p50 = group.map(sample => sample.p50);
      const p95 = group.map(sample => sample.p95);
      const sortedP50 = [...p50].sort((a, b) => a - b);
      byWorkerCount[workerCount] = {
        runs: group.length,
        rps: summarize(rps),
        p50: { ...summarize(p50), min: Math.min(...p50), max: Math.max(...p50), median: percentile(sortedP50, 0.5) },
        p95: { ...summarize(p95), min: Math.min(...p95), max: Math.max(...p95) },
      };
    }

    const cpuList = os.cpus();
    const report = {
      label: 'newly verified local variance study',
      createdAt: new Date().toISOString(),
      commit: gitValue(['rev-parse', 'HEAD']),
      branch: gitValue(['branch', '--show-current']),
      environment: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        node: process.version,
        cpuModel: cpuList[0]?.model || 'unknown',
        logicalCpuCores: cpuList.length,
        totalMemoryBytes: os.totalmem(),
        engine: 'node',
      },
      workload: {
        target: `${targetUrl}/fixed?delayMs=${delayMs}`,
        method: 'GET',
        concurrency,
        durationSec,
        requestTimeoutMs: 2000,
        delayMs,
        repetitions,
        workerCounts: [1, 2],
      },
      byWorkerCount,
      samples,
      interpretation: 'One-machine loopback measurements. RPS and latency variance include local process scheduling and target response overhead; they are not production or multi-machine performance claims.',
    };

    const resultsDir = path.join(repoRoot, 'benchmarks', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    const timestamp = report.createdAt.replace(/[:.]/g, '-');
    const jsonPath = path.join(resultsDir, `variance-study-${timestamp}.json`);
    const markdownPath = path.join(resultsDir, `variance-study-${timestamp}.md`);
    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const lines = [
      '# Newly verified local variance study',
      '',
      `- Date: ${report.createdAt}`,
      `- Commit: ${report.commit}`,
      `- Branch: ${report.branch}`,
      `- Environment: ${report.environment.platform} ${report.environment.release}, ${report.environment.arch}, Node ${report.environment.node}`,
      `- CPU: ${report.environment.cpuModel} (${report.environment.logicalCpuCores} logical cores); memory ${report.environment.totalMemoryBytes} bytes`,
      `- Engine: ${report.environment.engine}; target: ${report.workload.target}`,
      `- Workload: ${concurrency} VUs, ${durationSec}s, ${repetitions} runs per worker count, ${delayMs}ms controlled delay`,
      '',
      '| Workers | RPS mean | RPS SD | RPS CV | p50 mean (ms) | p50 SD (ms) | p50 CV | p50 range (ms) | p95 mean (ms) | p95 SD (ms) | p95 CV | p95 range (ms) |',
      '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ];
    for (const workerCount of [1, 2]) {
      const summary = byWorkerCount[workerCount];
      const fmt = value => value === null ? 'n/a' : Number(value).toFixed(4);
      lines.push(`| ${workerCount} | ${fmt(summary.rps.mean)} | ${fmt(summary.rps.standardDeviation)} | ${fmt(summary.rps.coefficientOfVariation)} | ${fmt(summary.p50.mean)} | ${fmt(summary.p50.standardDeviation)} | ${fmt(summary.p50.coefficientOfVariation)} | ${summary.p50.min}–${summary.p50.max} | ${fmt(summary.p95.mean)} | ${fmt(summary.p95.standardDeviation)} | ${fmt(summary.p95.coefficientOfVariation)} | ${summary.p95.min}–${summary.p95.max} |`);
    }
    lines.push('', 'Every sample is available in the adjacent JSON file. This local study measures noise for the current host and is not a cross-machine guarantee.', '');
    await fs.writeFile(markdownPath, lines.join('\n'), 'utf8');
    console.log(`JSON report: ${path.relative(repoRoot, jsonPath)}`);
    console.log(`Markdown report: ${path.relative(repoRoot, markdownPath)}`);
    console.log(JSON.stringify(byWorkerCount, null, 2));
  } finally {
    for (const run of await storage.getRuns()) {
      if (['queued', 'validating', 'running', 'cancelling'].includes(run.status)) await runner.cancelRun(run.id).catch(() => {});
    }
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`[variance-study] ${error.message}`);
  process.exitCode = 1;
});
