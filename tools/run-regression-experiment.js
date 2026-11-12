import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { JsonStorage } from '../server/storage/json-storage.js';
import { setStorage } from '../server/storage/index.js';
import { getRunnerManager } from '../server/runner/manager.js';
import { createApp } from '../server/app.js';
import { getEnvironmentMetadata } from '../server/environment.js';

const baseConfig = { path: '/health', method: 'GET', concurrency: 4, durationSec: 2, workerCount: 1, authorized: true };

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-regression-experiment-'));
  let delayMs = 50;
  const target = createServer((_req, res) => setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, controlledDelayMs: delayMs }));
  }, delayMs));
  const targetUrl = await listen(target);
  const storage = new JsonStorage(temp);
  await storage.init();
  setStorage(storage);
  const apiServer = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => apiServer.once('listening', resolve));
  const api = `http://127.0.0.1:${apiServer.address().port}/api/v1`;
  const runner = getRunnerManager(storage);
  const outputs = [];
  const password = `Df!${randomBytes(24).toString('base64url')}9A`;
  try {
    const register = await fetch(`${api}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Regression experiment', email: `experiment-${randomUUID()}@example.test`, password }),
    });
    if (!register.ok) throw new Error(`Register failed (${register.status}): ${await register.text()}`);
    const session = await register.json();
    const headers = { Authorization: `Bearer ${session.token}`, 'content-type': 'application/json' };
    const targetResponse = await fetch(`${api}/targets`, { method: 'POST', headers, body: JSON.stringify({ name: 'Controlled experiment target', url: targetUrl, environment: 'local' }) });
    if (!targetResponse.ok) throw new Error(`Target registration failed (${targetResponse.status}): ${await targetResponse.text()}`);
    const savedTarget = await targetResponse.json();

    async function execute(label) {
      const submitted = await fetch(`${api}/runs`, { method: 'POST', headers, body: JSON.stringify({ ...baseConfig, targetId: savedTarget.id }) });
      if (submitted.status !== 202) throw new Error(`Run submit failed (${submitted.status}): ${await submitted.text()}`);
      const queued = await submitted.json();
      const deadline = Date.now() + 30000;
      let run;
      while (Date.now() < deadline) {
        const response = await fetch(`${api}/runs/${queued.id}`, { headers });
        run = await response.json();
        if (['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (run?.status !== 'completed') throw new Error(`${label} run ${queued.id} ended ${run?.status || 'without result'}`);
      const response = await fetch(`${api}/runs/${queued.id}/regression`, { headers });
      if (!response.ok) throw new Error(`Verdict request failed (${response.status}): ${await response.text()}`);
      const verdict = await response.json();
      const sample = { label, runId: run.id, status: run.status, totalRequests: run.totalRequests, failedCount: run.failedCount, rps: run.rps, p95: run.p95, p99: run.p99, errorRate: run.errorRate, fingerprint: verdict.fingerprint, verdict: verdict.verdict, baselineCount: verdict.baselineCount, metrics: verdict.metrics };
      outputs.push(sample);
      console.log(`${label}: requests=${sample.totalRequests} rps=${sample.rps} p95=${sample.p95} verdict=${sample.verdict} baselines=${sample.baselineCount}`);
      return sample;
    }

    for (let index = 1; index <= 20; index++) await execute(`baseline-${String(index).padStart(2, '0')}`);
    const normalComparisons = outputs.filter(sample => sample.label.startsWith('baseline-') && sample.baselineCount >= 3);
    const falsePositives = normalComparisons.filter(sample => sample.verdict === 'regression').length;
    const falsePositiveRate = normalComparisons.length ? falsePositives / normalComparisons.length : null;
    delayMs = 150;
    const slowed = await execute('injected-150ms-slowdown');
    const report = {
      createdAt: new Date().toISOString(),
      environment: getEnvironmentMetadata('node', 1),
      workload: { ...baseConfig, target: `${targetUrl}/health`, normalDelayMs: 50, injectedDelayMs: 150, baselineRunCount: 20 },
      falsePositiveExperiment: { eligibleComparisons: normalComparisons.length, falsePositives, falsePositiveRate },
      slowdownExperiment: { observedVerdict: slowed.verdict, detection: slowed.verdict === 'regression', detectedMetrics: Object.entries(slowed.metrics).filter(([, value]) => value.verdict === 'regression').map(([key]) => key) },
      results: outputs,
      limitations: 'One Windows host, one local HTTP target, one test session, one workload shape. This measures local repeatability and a controlled slowdown only; it does not establish cross-host or production false-positive/detection rates.',
    };
    const resultPath = path.resolve('benchmarks/results', `regression-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.mkdir(path.dirname(resultPath), { recursive: true });
    await fs.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report: ${path.relative(process.cwd(), resultPath)}`);
    console.log(JSON.stringify({ falsePositiveExperiment: report.falsePositiveExperiment, slowdownExperiment: report.slowdownExperiment }, null, 2));
  } finally {
    await runner.shutdown(5000).catch(() => {});
    await new Promise(resolve => apiServer.close(resolve));
    await new Promise(resolve => target.close(resolve));
    await storage.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
