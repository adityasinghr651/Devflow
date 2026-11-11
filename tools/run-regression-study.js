#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const baseWorkload = { path: '/fixed', method: 'GET', concurrency: 4, durationSec: 2, workerCount: 1, authorized: true };
const magnitudes = [10, 25, 50];
const repetitions = 5;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

async function invokeCli(configPath, api, token, label) {
  const child = spawn(process.execPath, [
    'bin/devflow.js', 'run', '-c', configPath, '--api', `${api}/api/v1`, '--token', token, '--wait', '15', '--json',
  ], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
  child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
  const timer = setTimeout(() => child.kill(), 20_000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(() => clearTimeout(timer));
  let report;
  try { report = JSON.parse(stdout); }
  catch {
    const runId = stderr.match(/run ([0-9a-f-]{36})/i)?.[1];
    let latest = '';
    if (runId) {
      try {
        const response = await fetch(`${api}/api/v1/runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
        latest = ` Last run state: ${JSON.stringify(await response.json())}`;
      } catch {}
    }
    throw new Error(`${label}: CLI returned no JSON (exit=${exitCode}): ${stderr.slice(-1000)} ${stdout.slice(-1000)}${latest}`);
  }
  if (![0, 1].includes(exitCode) || report.status !== 'completed' || report.failedCount !== 0) {
    throw new Error(`${label}: CLI run failed (exit=${exitCode}, status=${report.status}, failed=${report.failedCount}): ${stderr.slice(-1000)}`);
  }
  return {
    label,
    exitCode,
    runId: report.runId,
    totalRequests: report.totalRequests,
    failedCount: report.failedCount,
    rps: report.rps,
    p95: report.p95,
    p99: report.p99,
    errorRate: report.errorRate,
    verdict: report.regression.verdict,
    baselineCount: report.regression.baselineCount,
    historySize: report.regression.historySize,
    minimumBaselineRuns: report.regression.minimumBaselineRuns,
    baselineRunIds: report.regression.baselineRunIds,
    metrics: report.regression.metrics,
  };
}

async function withStudySession(callback) {
  const [{ JsonStorage }, { setStorage }, { getRunnerManager }, { createApp }] = await Promise.all([
    import('../server/storage/json-storage.js'),
    import('../server/storage/index.js'),
    import('../server/runner/manager.js'),
    import('../server/app.js'),
  ]);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-regression-study-'));
  const storage = new JsonStorage(tempDir);
  let targetServer;
  let apiServer;
  let runner;
  try {
    await storage.init();
    setStorage(storage);
    targetServer = createServer(async (_request, response) => {
      const delayMs = Number(targetServer.controlledDelayMs || 50);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, controlledDelayMs: delayMs }));
    });
    const targetUrl = await listen(targetServer);
    apiServer = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { apiServer.once('listening', resolve); apiServer.once('error', reject); });
    const api = `http://127.0.0.1:${apiServer.address().port}`;
    const password = `Df!${randomBytes(24).toString('base64url')}9A`;
    const registered = await fetch(`${api}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Regression study', email: `study-${randomUUID()}@example.test`, password }),
    });
    if (!registered.ok) throw new Error(`Study account registration failed (${registered.status}): ${(await registered.text()).slice(0, 500)}`);
    const user = await registered.json();
    // The real CLI enforces account quotas; use a disposable Pro-tier study identity
    // so the 20-run baseline can be measured without changing application limits.
    await storage.updateUser(user.user.id, { tier: 'paid', plan: 'pro' });
    const headers = { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' };
    async function createConfig(label) {
      const createdTarget = await fetch(`${api}/api/v1/targets`, {
        method: 'POST', headers, body: JSON.stringify({ name: `Loopback regression study ${label}`, url: targetUrl, environment: 'local' }),
      });
      if (!createdTarget.ok) throw new Error(`Local target registration failed (${createdTarget.status}): ${(await createdTarget.text()).slice(0, 500)}`);
      const target = await createdTarget.json();
      const configPath = path.join(tempDir, `devflow-${label}.config.json`);
      await fs.writeFile(configPath, JSON.stringify({ ...baseWorkload, targetId: target.id }));
      return configPath;
    }
    const configPath = await createConfig('stable');
    runner = getRunnerManager(storage);
    return await callback({ targetServer, configPath, createConfig, api, token: user.token });
  } finally {
    if (runner) await runner.shutdown(5000).catch(() => {});
    if (apiServer?.listening) await close(apiServer);
    if (targetServer?.listening) await close(targetServer);
    await storage.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  process.env.RUNNER_ENGINE = 'node';
  const { getEnvironmentMetadata } = await import('../server/environment.js');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const environment = getEnvironmentMetadata('node', 1);
  const studies = await withStudySession(async session => {
    const results = [];
    for (let index = 1; index <= 20; index++) {
      const result = await invokeCli(session.configPath, session.api, session.token, `stable-${String(index).padStart(2, '0')}`);
      results.push(result);
      console.log(`${result.label}: verdict=${result.verdict} requests=${result.totalRequests} rps=${result.rps} p95=${result.p95}ms baselines=${result.baselineCount}/${result.historySize}`);
    }
    const comparable = results.filter(result => result.baselineCount >= result.minimumBaselineRuns);
    const falsePositives = comparable.filter(result => result.verdict === 'regression').length;
    const truePositiveGroups = [];
    for (const magnitudePercent of magnitudes) {
      const injectedDelayMs = 50 + Math.round(50 * magnitudePercent / 100);
      const trials = [];
      for (let repetition = 1; repetition <= repetitions; repetition++) {
        const configPath = await session.createConfig(`tp-${magnitudePercent}-${repetition}`);
        session.targetServer.controlledDelayMs = 50;
        const baseline = [];
        for (let index = 1; index <= 5; index++) {
          baseline.push(await invokeCli(configPath, session.api, session.token, `tp-${magnitudePercent}-${repetition}-baseline-${index}`));
        }
        session.targetServer.controlledDelayMs = injectedDelayMs;
        const current = await invokeCli(configPath, session.api, session.token, `tp-${magnitudePercent}-${repetition}-injected`);
        trials.push({ baseline, current });
        console.log(`slowdown +${magnitudePercent}% trial ${repetition}/${repetitions}: delay=${injectedDelayMs}ms verdict=${current.verdict} p95=${current.p95}ms`);
      }
      const detected = trials.filter(trial => trial.current.verdict === 'regression').length;
      truePositiveGroups.push({ magnitudePercent, baselineDelayMs: 50, injectedDelayMs, repetitions, detected, detectionRate: detected / repetitions, trials });
    }
    return { falsePositiveRuns: results, comparable, falsePositives, truePositiveGroups };
  });
  const { falsePositiveRuns, comparable, falsePositives, truePositiveGroups } = studies;

  const report = {
    createdAt: new Date().toISOString(),
    commit,
    branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    environment,
    target: 'Self-started HTTP target bound to 127.0.0.1; one fixed-delay endpoint, no external traffic.',
    account: 'Disposable account in temporary JSON storage, promoted to the existing paid tier only to avoid the 15-run Free quota during the study.',
    workload: baseWorkload,
    falsePositiveStudy: {
      stableRunCount: falsePositiveRuns.length,
      eligibleComparisons: comparable.length,
      falsePositives,
      falsePositiveRate: comparable.length ? falsePositives / comparable.length : null,
      runs: falsePositiveRuns,
    },
    truePositiveStudy: truePositiveGroups,
    limitations: 'Single Windows host, one local controlled target, one owner/session per trial, one workload shape. These counts are an internal repeatability study only; they are not expected rates for other machines, CI, applications, or teams.',
  };
  const outDir = path.resolve('benchmarks/results');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'regression-study-raw.json'), `${JSON.stringify(report, null, 2)}\n`);
  const falsePositivePercent = report.falsePositiveStudy.falsePositiveRate === null ? 'n/a' : `${(report.falsePositiveStudy.falsePositiveRate * 100).toFixed(2)}%`;
  const trueRows = truePositiveGroups.map(group => `| +${group.magnitudePercent}% | ${group.baselineDelayMs} ms | ${group.injectedDelayMs} ms | ${group.detected}/${group.repetitions} | ${(group.detectionRate * 100).toFixed(2)}% |`).join('\n');
  const markdown = `# Regression detector controlled study\n\nDate: ${report.createdAt}\nCommit: \`${commit}\`\nBranch: \`${report.branch}\`\nMachine: ${environment.platform} ${environment.osRelease}; ${environment.cpuModel}; ${environment.logicalCpuCores} logical CPUs; Node ${environment.nodeVersion}; ${environment.architecture}\nTarget: self-started loopback HTTP server at 127.0.0.1; fixed-delay response\nWorkload: GET /fixed; concurrency ${baseWorkload.concurrency}; ${baseWorkload.durationSec}s per run; ${baseWorkload.workerCount} worker; Node engine\nAccount: disposable temporary-storage account set to the existing paid tier to avoid its Free lifetime quota; no application quota settings were changed.\nPipeline: each measurement was launched by \`node bin/devflow.js run\` and completed through the API and statistical regression check.\n\n## False-positive study\n\n${comparable.length} runs had sufficient prior history from ${falsePositiveRuns.length} stable runs. ${falsePositives} were classified as regressions. Observed false-positive rate: **${falsePositivePercent} (${falsePositives}/${comparable.length})**. The first ${falsePositiveRuns.length - comparable.length} run(s) did not have enough history and returned insufficient data.\n\n## True-positive study\n\n${repetitions} independent trials per magnitude. Each trial established five baseline runs at 50 ms, then changed the controlled target delay while keeping the workload fingerprint unchanged.\n\n| Added latency | Baseline delay | Injected delay | Detected regressions | Observed detection rate |\n|---:|---:|---:|---:|---:|\n${trueRows}\n\n## Limitations\n\n${report.limitations} Raw per-run requests, latencies, verdicts, baseline IDs, metric bands, and study metadata are in [regression-study-raw.json](./regression-study-raw.json).\n`;
  await fs.writeFile(path.join(outDir, 'false-positive-study.md'), markdown);
  await fs.writeFile(path.join(outDir, 'true-positive-study.md'), markdown.replace('# Regression detector controlled study', '# True-positive study (with false-positive control)'));
  console.log(`False positives: ${falsePositives}/${comparable.length} (${falsePositivePercent})`);
  for (const group of truePositiveGroups) console.log(`+${group.magnitudePercent}% slowdown: ${group.detected}/${group.repetitions} detected`);
  console.log(`Raw report: ${path.relative(process.cwd(), path.join(outDir, 'regression-study-raw.json'))}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
