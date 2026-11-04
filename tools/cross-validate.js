import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';
import { createTestTargetServer, TARGET_CONFIG } from './test-target.js';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';
import { isK6Available, executeK6Run } from '../server/runner/k6-adapter.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const durationSec = 5;
const concurrency = 4;
const delayMs = 10;

function runAutocannon(url) {
  return new Promise((resolve, reject) => autocannon({ url, connections: concurrency, duration: durationSec, pipelining: 1 }, (error, result) => error ? reject(error) : resolve(result)));
}

async function runDevFlow(storage, runner, url) {
  const run = {
    id: randomUUID(), userId: 'cross-validation', targetId: 'loopback', targetName: 'Cross-validation target',
    url, method: 'GET', concurrency, durationSec, profile: 'fixed', stages: [], headers: {}, body: null,
    timeoutMs: 2000, workerCount: 1, status: 'queued', startedAt: new Date().toISOString(), totalRequests: 0,
    successCount: 0, failedCount: 0, rps: 0, p50: 0, p95: 0, p99: 0, errorRate: 0, statusCodes: {},
  };
  await storage.createRun(run);
  await runner.enqueueRun(run);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await storage.getRunById(run.id);
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(result.status)) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await runner.cancelRun(run.id).catch(() => {});
  throw new Error('DevFlow run timed out while cross-validating');
}

async function main() {
  process.env.RUNNER_ENGINE = 'node';
  const server = createTestTargetServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, TARGET_CONFIG.host, resolve); });
  const targetUrl = `http://${TARGET_CONFIG.host}:${server.address().port}/fixed?delayMs=${delayMs}`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-cross-validate-'));
  const storage = new JsonStorage(tempDir);
  await storage.init();
  const runner = new RunnerManager(storage);
  try {
    const devflow = await runDevFlow(storage, runner, targetUrl);
    const cannon = await runAutocannon(targetUrl);
    const k6Installed = await isK6Available();
    const k6 = k6Installed
      ? await executeK6Run({ id: randomUUID(), url: targetUrl, method: 'GET', concurrency, durationSec })
      : null;
    const report = {
      label: 'newly verified local cross-tool comparison',
      createdAt: new Date().toISOString(),
      environment: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version },
      workload: { target: targetUrl, method: 'GET', concurrency, durationSec, delayMs },
      tools: {
        devflow: { status: devflow.status, engine: devflow.engine, totalRequests: devflow.totalRequests, rps: devflow.rps, p50: devflow.p50, p95: devflow.p95, p99: devflow.p99, windowSec: devflow.measurementWindowSec },
        autocannon: { status: 'completed', totalRequests: cannon.requests.total, rps: cannon.requests.average, p50: cannon.latency.p50, p95: null, p99: cannon.latency.p99, raw: cannon },
        k6: k6 ? { status: k6.status, engine: 'k6', totalRequests: k6.totalRequests, rps: k6.rps, p50: k6.p50, p95: k6.p95, p99: k6.p99, raw: k6 } : { status: 'NOT RUN (not installed)' },
      },
      gaps: {
        rpsPercent: Number((((devflow.rps - cannon.requests.average) / cannon.requests.average) * 100).toFixed(2)),
        p50Ms: Number((devflow.p50 - cannon.latency.p50).toFixed(2)),
        p95Ms: null,
        p99Ms: Number((devflow.p99 - cannon.latency.p99).toFixed(2)),
      },
      interpretation: 'These tools do not match definitions exactly: DevFlow reports its measured first-request-start to last-response-completion window and merged worker histogram; autocannon reports its run duration and client-side latency histogram. Client and process overhead, target scheduling, and percentile implementation contribute to gaps. This one-host loopback comparison is not an equivalence or production-scale claim.',
    };
    const resultsDir = path.join(repoRoot, 'benchmarks', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    const timestamp = report.createdAt.replace(/[:.]/g, '-');
    const jsonPath = path.join(resultsDir, `cross-validation-${timestamp}.json`);
    const mdPath = path.join(resultsDir, `cross-validation-${timestamp}.md`);
    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const rows = [['DevFlow', report.tools.devflow], ['autocannon', report.tools.autocannon]];
    const markdown = [
      '# Newly verified local cross-tool comparison', '',
      `- Target: ${targetUrl}`, `- Workload: ${concurrency} connections, ${durationSec}s, ${delayMs}ms delay`,
      `- Environment: ${report.environment.platform} ${report.environment.release}, Node ${report.environment.node}`, '',
      '| Tool | RPS | p50 (ms) | p95 (ms) | p99 (ms) |', '|---|---:|---:|---:|---:|',
      ...rows.map(([name, row]) => `| ${name} | ${row.rps} | ${row.p50} | ${row.p95 ?? 'unavailable'} | ${row.p99} |`), '',
      `- RPS gap (DevFlow vs autocannon): ${report.gaps.rpsPercent}%`,
      `- Latency gaps (DevFlow minus autocannon): p50 ${report.gaps.p50Ms}ms; p95 unavailable in autocannon summary; p99 ${report.gaps.p99Ms}ms`,
      `- k6: ${report.tools.k6.status}`, '', report.interpretation, '',
      `Full raw output: ${path.basename(jsonPath)}`, '',
    ].join('\n');
    await fs.writeFile(mdPath, markdown);
    console.log(markdown);
    console.log(`JSON report: ${path.relative(repoRoot, jsonPath)}`);
  } finally {
    for (const run of await storage.getRuns()) if (['queued', 'validating', 'running', 'cancelling'].includes(run.status)) await runner.cancelRun(run.id).catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(`[cross-validate] ${error.message}`); process.exitCode = 1; });
