/**
 * Unified Automated Benchmark Runner for CI/CD and Local Regression Testing.
 *
 * Runs controlled load-test benchmarks against the local test target using
 * the exact same RunnerManager and LatencyHistogram worker process used in production.
 *
 * Usage:
 *   node tools/run-benchmark.js --ci
 *   node tools/run-benchmark.js --ci --save-baseline
 *   node tools/run-benchmark.js --levels 1,5,10 --duration 15 --output data/custom.json
 */
import { fork } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';
import { setStorage } from '../server/storage/index.js';

const TARGET_PORT = 5050;
const TARGET_HOST = '127.0.0.1';
const TARGET_URL = `http://${TARGET_HOST}:${TARGET_PORT}/health`;

async function waitForTarget(url, maxRetries = 40, delayMs = 150) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

export async function runControlledBenchmark(options = {}) {
  const isCi = options.ci ?? true;
  const levels = options.levels || (isCi ? [1, 10] : [1, 5, 10, 20]);
  const durationSec = options.durationSec || (isCi ? 10 : 30);
  const warmupSec = options.warmupSec || (isCi ? 3 : 5);
  const outputFile = options.outputFile || (isCi ? 'data/ci-benchmark.json' : 'data/benchmark-matrix.json');
  const saveBaseline = options.saveBaseline || false;
  const baselineFile = options.baselineFile || 'benchmarks/baseline.json';

  console.log('='.repeat(80));
  console.log(` SERVERTEST BENCHMARK RUNNER [${isCi ? 'CI PROFILE' : 'FULL MATRIX'}]`);
  console.log('='.repeat(80));
  console.log(`Platform: ${process.platform} (${os.release()}) | Node: ${process.version}`);
  console.log(`Target:   ${TARGET_URL}`);
  console.log(`Levels:   ${levels.join(', ')} VUs | Duration: ${durationSec}s per level | Warmup: ${warmupSec}s`);
  console.log(`Output:   ${outputFile}`);
  if (saveBaseline) console.log(`Baseline: ${baselineFile} (will be updated)`);
  console.log('='.repeat(80));

  // 1. Launch Controlled Local Test Target
  console.log('\n[1/4] Spawning local test target process on port 5050...');
  const targetChild = fork(path.resolve('tools/test-target.js'), [String(TARGET_PORT)], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });

  let targetHealthy = false;
  try {
    targetHealthy = await waitForTarget(TARGET_URL);
  } catch (err) {
    targetChild.kill();
    throw new Error(`Target check failed: ${err.message}`);
  }

  if (!targetHealthy) {
    targetChild.kill();
    throw new Error(`Target at ${TARGET_URL} failed to become healthy within deadline.`);
  }
  console.log(`[1/4] Target healthy and responding with HTTP 200 (PID: ${targetChild.pid}).`);

  // 2. Setup Isolated Storage & Runner Manager
  const storageTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-bench-store-'));
  const storage = new JsonStorage(storageTmpDir);
  await storage.init();
  setStorage(storage);
  const runner = new RunnerManager(storage);

  const measuredResults = [];
  let warmupResult = null;

  async function executeTrial({ runId, label, concurrency, duration, isWarmup = false }) {
    console.log(`\n>>> [Trial] ${label} (${concurrency} VU, ${duration}s)...`);
    const runRecord = {
      id: runId,
      userId: 'ci-benchmark-runner',
      targetId: 'controlled-target',
      targetName: 'Controlled Local Target',
      url: TARGET_URL,
      method: 'GET',
      concurrency,
      durationSec: duration,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 5000,
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

    await storage.createRun(runRecord);
    await runner.enqueueRun(runRecord);

    const tStart = Date.now();
    let finalRun = null;
    const deadline = Date.now() + (duration * 1000) + 10000;

    while (Date.now() < deadline) {
      const r = await storage.getRunById(runId);
      if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
        finalRun = r;
        break;
      }
      await new Promise(res => setTimeout(res, 150));
    }

    if (!finalRun || finalRun.status !== 'completed') {
      throw new Error(`Trial ${label} failed or did not complete. Status: ${finalRun?.status || 'timed_out'}`);
    }

    const tEnd = Date.now();
    const actualDurationSec = Number(((tEnd - tStart) / 1000).toFixed(2));

    const result = {
      testId: runId,
      label,
      isWarmup,
      timestamp: new Date().toISOString(),
      endpoint: TARGET_URL,
      concurrency,
      configuredDurationSec: duration,
      actualDurationSec,
      achievedRps: finalRun.rps,
      totalRequests: finalRun.totalRequests,
      successCount: finalRun.successCount,
      failedCount: finalRun.failedCount,
      errorRate: finalRun.errorRate,
      p50: finalRun.p50,
      p95: finalRun.p95,
      p99: finalRun.p99,
      statusCodes: finalRun.statusCodes || {},
    };

    console.log(`<<< [Done] ${label}: RPS=${result.achievedRps} | p50=${result.p50}ms | p95=${result.p95}ms | p99=${result.p99}ms | Errors=${result.failedCount}`);
    await new Promise(res => setTimeout(res, 1000));
    return result;
  }

  try {
    // 3. Warm-up
    console.log('\n[2/4] Executing warm-up trial (2 VUs, 3s) to prime JIT & sockets...');
    warmupResult = await executeTrial({
      runId: `warmup-${Date.now()}`,
      label: 'Warmup Run',
      concurrency: 2,
      duration: warmupSec,
      isWarmup: true,
    });

    // 4. Measured Runs
    console.log('\n[3/4] Executing measured benchmark trials...');
    for (const vu of levels) {
      const trial = await executeTrial({
        runId: `bench-vu${vu}-${Date.now()}`,
        label: `${vu} VU`,
        concurrency: vu,
        duration: durationSec,
        isWarmup: false,
      });
      measuredResults.push(trial);
    }

    // 5. Save Output
    console.log('\n[4/4] Writing benchmark dataset output...');
    const payload = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      profile: isCi ? 'ci' : 'matrix',
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        memoryMB: Math.round(os.totalmem() / (1024 * 1024)),
        isCi: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
      },
      warmup: warmupResult,
      benchmarks: measuredResults,
    };

    const outPath = path.resolve(outputFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[Success] Saved benchmark results to: ${outPath}`);

    if (saveBaseline) {
      const baseOutPath = path.resolve(baselineFile);
      await fs.mkdir(path.dirname(baseOutPath), { recursive: true });
      await fs.writeFile(baseOutPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[Success] Saved new baseline to: ${baseOutPath}`);
    }

    return payload;
  } finally {
    // Teardown
    console.log('\n[Teardown] Stopping local target server & removing temporary storage...');
    targetChild.kill();
    await fs.rm(storageTmpDir, { recursive: true, force: true }).catch(() => {});
    console.log('[Teardown] Complete.\n');
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const options = {
    ci: true,
    saveBaseline: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ci') options.ci = true;
    else if (args[i] === '--matrix') options.ci = false;
    else if (args[i] === '--save-baseline') options.saveBaseline = true;
    else if (args[i] === '--duration' && args[i + 1]) options.durationSec = Number(args[++i]);
    else if (args[i] === '--levels' && args[i + 1]) options.levels = args[++i].split(',').map(Number);
    else if (args[i] === '--output' && args[i + 1]) options.outputFile = args[++i];
    else if (args[i] === '--baseline' && args[i + 1]) options.baselineFile = args[++i];
  }

  await runControlledBenchmark(options);
}

if (process.argv[1] && process.argv[1].endsWith('run-benchmark.js')) {
  main().catch(err => {
    console.error('[Benchmark Error]', err);
    process.exit(1);
  });
}

