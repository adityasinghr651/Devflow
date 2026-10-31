import { fork, execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';
import { setStorage } from '../server/storage/index.js';

const execFileAsync = promisify(execFile);
const CPU_CORES = os.cpus().length;
const TARGET_PORT = 5050;
const TARGET_HOST = '127.0.0.1';
const BASE_URL = `http://${TARGET_HOST}:${TARGET_PORT}`;
const ENDPOINT_PATH = '/health';
const TARGET_URL = `${BASE_URL}${ENDPOINT_PATH}`;

async function queryProcessStats(pids) {
  const validPids = (pids || []).filter(p => typeof p === 'number' && p > 0);
  if (!validPids.length) return {};
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      `Get-Process -Id ${validPids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id, CPU, WorkingSet64 | ConvertTo-Json -Compress`
    ]);
    if (!stdout.trim()) return {};
    const parsed = JSON.parse(stdout.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const map = {};
    for (const item of list) {
      if (!item || !item.Id) continue;
      map[item.Id] = {
        id: item.Id,
        cpuSec: typeof item.CPU === 'number' ? Number(item.CPU.toFixed(3)) : 0,
        memoryMB: typeof item.WorkingSet64 === 'number' ? Number((item.WorkingSet64 / (1024 * 1024)).toFixed(2)) : 0,
      };
    }
    return map;
  } catch {
    return {};
  }
}

async function saveDatasets(dataDir, warmupResult, results) {
  const jsonPath = path.join(dataDir, 'benchmark-matrix.json');
  const csvPath = path.join(dataDir, 'benchmark-matrix.csv');

  await fs.writeFile(jsonPath, JSON.stringify({ warmup: warmupResult, measured: results }, null, 2), 'utf8');

  const csvHeaders = [
    'testId',
    'label',
    'iteration',
    'concurrency',
    'configuredDurationSec',
    'actualDurationSec',
    'achievedRps',
    'totalRequests',
    'successCount',
    'failedCount',
    'errorRate',
    'p50',
    'p95',
    'p99',
    'statusCodes',
    'targetCoreCpuPct',
    'targetPeakMemoryMB',
    'workerCoreCpuPct',
    'workerPeakMemoryMB',
    'timestamp',
  ];

  const csvRows = [csvHeaders.join(',')];
  for (const r of results) {
    const row = csvHeaders.map(h => {
      const val = r[h] !== undefined ? r[h] : '';
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvRows.push(row.join(','));
  }

  await fs.writeFile(csvPath, csvRows.join('\n'), 'utf8');
}

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log(' SERVERTEST PHASE 5.4 / 5.5: BENCHMARK MATRIX & CAPACITY AUDIT');
  console.log('='.repeat(80));
  console.log(`OS: ${process.platform} (${os.release()})`);
  console.log(`Node: ${process.version} | Cores: ${CPU_CORES} | Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`Target: ${TARGET_URL} (Localhost verified)`);
  console.log(`Safety Limits: maxConcurrency=20, maxDurationSec=30`);
  console.log('='.repeat(80));

  // 1. Launch Controlled Local Test Target
  console.log('\n[Setup] Launching controlled test target on port 5050...');
  const targetChild = fork(path.resolve('tools/test-target.js'), [String(TARGET_PORT)], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const targetPid = targetChild.pid;
  console.log(`[Setup] Target running with PID: ${targetPid}`);

  // Confirm target responsiveness
  let targetHealthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(TARGET_URL);
      if (res.status === 200) {
        targetHealthy = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (!targetHealthy) {
    targetChild.kill();
    throw new Error(`Target at ${TARGET_URL} failed to respond on startup.`);
  }
  console.log('[Setup] Target confirmed healthy and responding with HTTP 200.');

  // 2. Setup Isolated Storage and Runner Manager
  const dataDir = path.resolve('data');
  await fs.mkdir(dataDir, { recursive: true });
  const storageTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-bench-store-'));
  const storage = new JsonStorage(storageTmpDir);
  await storage.init();
  setStorage(storage);
  const runner = new RunnerManager(storage);

  const results = [];
  let warmupResult = null;

  // Helper: Run a single benchmark trial with live resource monitoring
  async function executeTrial({ runId, label, concurrency, durationSec, isWarmup = false }) {
    console.log(`\n>>> [Trial Start] ${label} (${concurrency} VU${concurrency > 1 ? 's' : ''}, ${durationSec}s)`);
    const runRecord = {
      id: runId,
      userId: 'benchmark-runner',
      targetId: 'controlled-target',
      targetName: 'Controlled Local Target',
      url: TARGET_URL,
      method: 'GET',
      concurrency,
      durationSec,
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

    // Discover Worker Process PID
    let workerPid = null;
    for (let i = 0; i < 40; i++) {
      const active = runner.activeRuns.get(runId);
      if (active?.child?.pid) {
        workerPid = active.child.pid;
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    const tStart = Date.now();
    const initialStats = await queryProcessStats([targetPid, workerPid]);
    const targetCpuStart = initialStats[targetPid]?.cpuSec || 0;
    const workerCpuStart = initialStats[workerPid]?.cpuSec || 0;

    let targetPeakMem = initialStats[targetPid]?.memoryMB || 0;
    let workerPeakMem = initialStats[workerPid]?.memoryMB || 0;
    let lastWorkerCpu = workerCpuStart;
    let lastTargetCpu = targetCpuStart;

    // Resource sampling loop while run is active
    const sampleInterval = setInterval(async () => {
      if (!workerPid) return;
      const stats = await queryProcessStats([targetPid, workerPid]);
      if (stats[targetPid]) {
        lastTargetCpu = stats[targetPid].cpuSec;
        targetPeakMem = Math.max(targetPeakMem, stats[targetPid].memoryMB);
      }
      if (stats[workerPid]) {
        lastWorkerCpu = stats[workerPid].cpuSec;
        workerPeakMem = Math.max(workerPeakMem, stats[workerPid].memoryMB);
      }
    }, 1500);

    // Wait for run completion
    let finalRun = null;
    const deadline = Date.now() + (durationSec * 1000) + 12000;
    while (Date.now() < deadline) {
      const r = await storage.getRunById(runId);
      if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
        finalRun = r;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    clearInterval(sampleInterval);

    // Final sample for target
    const finalStats = await queryProcessStats([targetPid]);
    if (finalStats[targetPid]) {
      lastTargetCpu = finalStats[targetPid].cpuSec;
      targetPeakMem = Math.max(targetPeakMem, finalStats[targetPid].memoryMB);
    }

    const tEnd = Date.now();
    const actualDurationSec = Number(((tEnd - tStart) / 1000).toFixed(2));

    const targetDeltaCpu = Math.max(0, lastTargetCpu - targetCpuStart);
    const workerDeltaCpu = Math.max(0, lastWorkerCpu - workerCpuStart);

    // CPU percentage of single core (100% = 1 full core)
    const targetCoreCpuPct = Number(((targetDeltaCpu / actualDurationSec) * 100).toFixed(1));
    const workerCoreCpuPct = Number(((workerDeltaCpu / actualDurationSec) * 100).toFixed(1));

    // Total system CPU % across all cores
    const targetSysCpuPct = Number((targetCoreCpuPct / CPU_CORES).toFixed(2));
    const workerSysCpuPct = Number((workerCoreCpuPct / CPU_CORES).toFixed(2));

    const trialData = {
      testId: runId,
      label,
      isWarmup,
      timestamp: new Date().toISOString(),
      endpoint: TARGET_URL,
      method: 'GET',
      concurrency,
      configuredDurationSec: durationSec,
      actualDurationSec,
      achievedRps: finalRun.rps,
      totalRequests: finalRun.totalRequests,
      successCount: finalRun.successCount,
      failedCount: finalRun.failedCount,
      errorRate: finalRun.errorRate,
      p50: finalRun.p50,
      p95: finalRun.p95,
      p99: finalRun.p99,
      statusCodes: JSON.stringify(finalRun.statusCodes || {}),
      targetPid,
      targetCoreCpuPct,
      targetSysCpuPct,
      targetPeakMemoryMB: Number(targetPeakMem.toFixed(2)),
      workerPid: workerPid || null,
      workerCoreCpuPct,
      workerSysCpuPct,
      workerPeakMemoryMB: Number(workerPeakMem.toFixed(2)),
    };

    console.log(`<<< [Trial Done] ${label}:`);
    console.log(`    Duration: ${actualDurationSec}s | RPS: ${trialData.achievedRps} | Total: ${trialData.totalRequests} | Errors: ${trialData.failedCount} (${trialData.errorRate}%)`);
    console.log(`    Latencies: p50 = ${trialData.p50}ms, p95 = ${trialData.p95}ms, p99 = ${trialData.p99}ms`);
    console.log(`    Resources: Target CPU = ${targetCoreCpuPct}%, Worker CPU = ${workerCoreCpuPct}%, Worker Peak Mem = ${workerPeakMem.toFixed(1)}MB`);

    // Cooldown pause between trials
    await new Promise(r => setTimeout(r, 2000));
    return trialData;
  }

  try {
    // 3. Warm-up Run (Separated from measured runs)
    console.log('\n[Phase 1] Executing warm-up run (2 VUs for 5s) to prime V8 JIT & OS sockets...');
    warmupResult = await executeTrial({
      runId: 'warmup-trial-' + Date.now(),
      label: 'Warmup Run',
      concurrency: 2,
      durationSec: 5,
      isWarmup: true,
    });
    console.log('[Phase 1] Warm-up completed. Discarding warm-up metrics from measured dataset.\n');

    // 4. Benchmark Matrix (1, 5, 10, 20 VUs for 30s each)
    const testLevels = [1, 5, 10, 20];
    const iterations = [1, 2];

    for (const iter of iterations) {
      console.log(`\n${'#'.repeat(80)}`);
      console.log(` BENCHMARK MATRIX — ITERATION ${iter} of ${iterations.length}`);
      console.log(`${'#'.repeat(80)}`);

      for (const vu of testLevels) {
        const runId = `bench-vu${vu}-iter${iter}-${Date.now()}`;
        const label = `Iter ${iter} - ${vu} VU${vu > 1 ? 's' : ''}`;
        const trialResult = await executeTrial({
          runId,
          label,
          concurrency: vu,
          durationSec: 30,
          isWarmup: false,
        });
        trialResult.iteration = iter;
        trialResult.level = vu;
        results.push(trialResult);

        // Save progressive datasets after each trial
        await saveDatasets(dataDir, warmupResult, results);
      }
    }

    // 5. Summary Comparison Table
    console.log('\n' + '='.repeat(110));
    console.log(' BENCHMARK MATRIX SUMMARY TABLE');
    console.log('='.repeat(110));
    console.log('| Level | Iter | Actual Dur | Achieved RPS | Requests | Failures | Err % | p50 (ms) | p95 (ms) | p99 (ms) | Target CPU% | Worker CPU% | Worker Mem |');
    console.log('| :---: | :--: | :--------: | :----------: | :------: | :------: | :---: | :------: | :------: | :------: | :---------: | :---------: | :--------: |');
    for (const r of results) {
      console.log(`| ${String(r.concurrency).padEnd(5)} | ${String(r.iteration).padEnd(4)} | ${(r.actualDurationSec + 's').padEnd(10)} | ${String(r.achievedRps).padEnd(12)} | ${String(r.totalRequests).padEnd(8)} | ${String(r.failedCount).padEnd(8)} | ${(r.errorRate + '%').padEnd(5)} | ${String(r.p50).padEnd(8)} | ${String(r.p95).padEnd(8)} | ${String(r.p99).padEnd(8)} | ${(r.targetCoreCpuPct + '%').padEnd(11)} | ${(r.workerCoreCpuPct + '%').padEnd(11)} | ${(r.workerPeakMemoryMB + ' MB').padEnd(10)} |`);
    }
    console.log('='.repeat(110));

  } finally {
    // 6. Cleanup
    console.log('\n[Teardown] Shutting down controlled test target...');
    targetChild.kill();
    await fs.rm(storageTmpDir, { recursive: true, force: true }).catch(() => {});
    console.log('[Teardown] Benchmark matrix run complete.');
  }
}

runBenchmark().catch(err => {
  console.error('[Benchmark Error]', err);
  process.exit(1);
});
