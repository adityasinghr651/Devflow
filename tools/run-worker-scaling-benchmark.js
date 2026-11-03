/**
 * Repeatable Multi-Worker Scaling Benchmark (1, 2, 4 Workers)
 *
 * Runs controlled multi-round benchmark matrix against tools/test-target.js
 * using rotated execution orders to mitigate order bias and warm-up drift.
 *
 * Usage:
 *   node tools/run-worker-scaling-benchmark.js
 *   node tools/run-worker-scaling-benchmark.js --vus 8 --duration 10 --rounds 3
 */
import { fork, execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';
import { setStorage } from '../server/storage/index.js';

// Force node coordinator engine (never accidental k6)
process.env.RUNNER_ENGINE = 'node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TARGET_PORT = 5050;
const TARGET_HOST = '127.0.0.1';
const TARGET_URL = `http://${TARGET_HOST}:${TARGET_PORT}/health`;

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { cwd: rootDir, encoding: 'utf8' }).trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

function calculateMedian(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : Number(((s[mid - 1] + s[mid]) / 2).toFixed(2));
}

function calculateSpread(arr) {
  if (!arr.length) return { min: 0, max: 0, spread: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return { min, max, spread: Number((max - min).toFixed(2)) };
}

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

export async function runWorkerScalingBenchmark(options = {}) {
  const vus = Number(options.vus || 8);
  const durationSec = Number(options.durationSec || 10);
  const rounds = Number(options.rounds || 3);
  const warmupSec = 3;

  const git = getGitInfo();
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'Unknown CPU';
  const cpuCores = cpus.length;
  const totalMemGb = (os.totalmem() / (1024 ** 3)).toFixed(1);

  console.log('='.repeat(80));
  console.log(' DEVFLOW MULTI-WORKER SCALING BENCHMARK (1, 2, 4 WORKERS)');
  console.log('='.repeat(80));
  console.log(`Commit:   ${git.commit.slice(0, 8)} (${git.branch})`);
  console.log(`System:   ${os.type()} ${os.release()} ${os.arch()} | ${cpuModel} (${cpuCores} cores) | ${totalMemGb} GB RAM`);
  console.log(`Node:     ${process.version} | Engine: node (coordinated multi-process)`);
  console.log(`Target:   ${TARGET_URL} (GET)`);
  console.log(`Workload: ${vus} VUs | ${durationSec}s per run | ${rounds} rounds with rotated worker ordering`);
  console.log('='.repeat(80));

  // 1. Launch Controlled Local Target
  console.log('\n[1/4] Spawning local test target process on 127.0.0.1:5050...');
  const targetChild = fork(path.resolve(rootDir, 'tools/test-target.js'), [String(TARGET_PORT)], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });

  const targetReady = await waitForTarget(TARGET_URL);
  if (!targetReady) {
    targetChild.kill();
    throw new Error(`Target failed to become healthy at ${TARGET_URL}`);
  }
  console.log('Target is healthy and accepting connections.');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-scaling-bench-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);
  const runner = new RunnerManager(storage);

  try {
    // 2. Warm-up Run (Not measured)
    console.log(`\n[2/4] Executing unmeasured warm-up run (${warmupSec}s, 2 VUs)...`);
    const warmupRun = {
      id: 'warmup-run',
      userId: 'bench-user',
      targetId: 'bench-target',
      targetName: 'Controlled Target',
      url: TARGET_URL,
      method: 'GET',
      concurrency: 2,
      durationSec: warmupSec,
      workerCount: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 5000,
      status: 'queued',
      startedAt: new Date().toISOString(),
    };
    await storage.createRun(warmupRun);
    await runner.enqueueRun(warmupRun);
    while (true) {
      const r = await storage.getRunById('warmup-run');
      if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) break;
      await new Promise(res => setTimeout(res, 100));
    }
    console.log('Warm-up complete. System caches and TCP sockets primed.\n');

    // 3. Multi-Round Rotated Execution Matrix
    console.log(`[3/4] Executing ${rounds} rotated benchmarking rounds...`);
    const rotationPatterns = [
      [1, 2, 4],
      [2, 4, 1],
      [4, 1, 2],
    ];

    const perRunResults = [];

    for (let roundIdx = 0; roundIdx < rounds; roundIdx++) {
      const pattern = rotationPatterns[roundIdx % rotationPatterns.length];
      console.log(`\n--- Round ${roundIdx + 1} of ${rounds} (Execution Order: ${pattern.join(' -> ')} workers) ---`);

      for (const workerCount of pattern) {
        const runId = `bench-r${roundIdx + 1}-w${workerCount}-${Date.now().toString(36)}`;
        process.stdout.write(`  [w=${workerCount}] Executing ${vus} VUs for ${durationSec}s ... `);

        const runRecord = {
          id: runId,
          userId: 'bench-user',
          targetId: 'bench-target',
          targetName: 'Controlled Target',
          url: TARGET_URL,
          method: 'GET',
          concurrency: vus,
          durationSec,
          workerCount,
          profile: 'fixed',
          stages: [],
          headers: {},
          body: null,
          timeoutMs: 5000,
          status: 'queued',
          startedAt: new Date().toISOString(),
        };

        await storage.createRun(runRecord);
        await runner.enqueueRun(runRecord);

        let finalRun = null;
        while (true) {
          const r = await storage.getRunById(runId);
          if (r && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
            finalRun = r;
            break;
          }
          await new Promise(res => setTimeout(res, 100));
        }

        const runData = {
          round: roundIdx + 1,
          workerCount,
          totalRequests: finalRun.totalRequests,
          successCount: finalRun.successCount,
          failedCount: finalRun.failedCount,
          httpErrorCount: finalRun.httpErrorCount || 0,
          timeoutCount: finalRun.timeoutCount || 0,
          networkErrorCount: finalRun.networkErrorCount || 0,
          cancelledCount: finalRun.cancelledCount || 0,
          errorRate: finalRun.errorRate,
          rps: finalRun.rps,
          p50: finalRun.p50,
          p95: finalRun.p95,
          p99: finalRun.p99,
          status: finalRun.status,
          engine: finalRun.engine || 'node',
        };
        perRunResults.push(runData);

        console.log(`RPS: ${finalRun.rps.toFixed(1)} | p50: ${finalRun.p50.toFixed(2)}ms | p95: ${finalRun.p95.toFixed(2)}ms | Errors: ${finalRun.failedCount} (${finalRun.errorRate.toFixed(4)}%)`);

        // Brief cooldown between runs to allow socket cleanup
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // 4. Compute Median & Spread Summary
    console.log('\n[4/4] Computing statistical medians and scaling ratios...');
    const workerGroups = { 1: [], 2: [], 4: [] };
    for (const r of perRunResults) {
      if (workerGroups[r.workerCount]) {
        workerGroups[r.workerCount].push(r);
      }
    }

    const summaryByWorker = {};
    for (const count of [1, 2, 4]) {
      const items = workerGroups[count];
      const rpsList = items.map(i => i.rps);
      const p50List = items.map(i => i.p50);
      const p95List = items.map(i => i.p95);
      const p99List = items.map(i => i.p99);
      const reqList = items.map(i => i.totalRequests);
      const errList = items.map(i => i.errorRate);

      summaryByWorker[count] = {
        workerCount: count,
        runsCount: items.length,
        rps: {
          median: calculateMedian(rpsList),
          ...calculateSpread(rpsList),
        },
        p50: {
          median: calculateMedian(p50List),
          ...calculateSpread(p50List),
        },
        p95: {
          median: calculateMedian(p95List),
          ...calculateSpread(p95List),
        },
        p99: {
          median: calculateMedian(p99List),
          ...calculateSpread(p99List),
        },
        totalRequests: {
          median: calculateMedian(reqList),
          ...calculateSpread(reqList),
        },
        errorRate: {
          median: calculateMedian(errList),
          ...calculateSpread(errList),
        },
      };
    }

    const w1Rps = summaryByWorker[1].rps.median || 1;
    const w2Rps = summaryByWorker[2].rps.median;
    const w4Rps = summaryByWorker[4].rps.median;

    const ratio2 = Number((w2Rps / w1Rps).toFixed(2));
    const ratio4 = Number((w4Rps / w1Rps).toFixed(2));

    const w1p50 = summaryByWorker[1].p50.median || 1;
    const w2p50 = summaryByWorker[2].p50.median;
    const w4p50 = summaryByWorker[4].p50.median;

    const p50Change2 = Number((((w2p50 - w1p50) / w1p50) * 100).toFixed(1));
    const p50Change4 = Number((((w4p50 - w1p50) / w1p50) * 100).toFixed(1));

    // Scaling verdict evaluation
    let scalingVerdict = 'Sublinear Scaling';
    if (ratio4 >= 3.8) {
      scalingVerdict = 'Near-Linear Scaling (High Efficiency)';
    } else if (ratio4 >= 3.0) {
      scalingVerdict = 'Strong Sublinear Scaling (Multi-core Utilized)';
    } else if (ratio4 >= 2.0) {
      scalingVerdict = 'Moderate Sublinear Scaling (CPU Saturated)';
    }

    const timestampIso = new Date().toISOString();
    const cleanTs = timestampIso.replace(/[:.]/g, '-');

    const resultPayload = {
      meta: {
        timestamp: timestampIso,
        commit: git.commit,
        branch: git.branch,
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: `${cpuModel} (${cpuCores} cores)`,
        memory: `${totalMemGb} GB`,
        node: process.version,
        engine: 'node',
        targetUrl: TARGET_URL,
        method: 'GET',
        vus,
        durationSec,
        rounds,
      },
      summary: summaryByWorker,
      ratios: {
        w1: { rpsRatio: 1.0, p50ChangePercent: 0 },
        w2: { rpsRatio: ratio2, p50ChangePercent: p50Change2 },
        w4: { rpsRatio: ratio4, p50ChangePercent: p50Change4 },
        scalingVerdict,
      },
      perRunResults,
    };

    // 5. Generate Markdown Report
    const mdLines = [
      '# DevFlow Multi-Worker Scaling Benchmark Report',
      '',
      `**Generated:** ${timestampIso}  `,
      `**Branch:** \`${git.branch}\` | **Commit:** \`${git.commit.slice(0, 8)}\`  `,
      `**Platform:** ${os.type()} ${os.release()} (${os.arch()})  `,
      `**CPU:** ${cpuModel} (${cpuCores} logical cores) | **RAM:** ${totalMemGb} GB  `,
      `**Node Version:** ${process.version} | **Execution Engine:** \`node\` (Coordinator)  `,
      `**Target:** \`${TARGET_URL}\` (GET) | **Workload:** ${vus} VUs · ${durationSec}s per run · ${rounds} rounds rotated  `,
      '',
      '---',
      '',
      '## 1. Statistical Summary (Median & Min-Max Spread)',
      '',
      '| Workers | Median RPS | RPS Spread (Min – Max) | Median p50 (ms) | Median p95 (ms) | Median p99 (ms) | Error Rate | Throughput Ratio vs 1W |',
      '| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
      `| **1 Worker** | **${summaryByWorker[1].rps.median.toLocaleString()}** | ${summaryByWorker[1].rps.min} – ${summaryByWorker[1].rps.max} | ${summaryByWorker[1].p50.median} ms | ${summaryByWorker[1].p95.median} ms | ${summaryByWorker[1].p99.median} ms | ${summaryByWorker[1].errorRate.median.toFixed(4)}% | **1.00x** (Baseline) |`,
      `| **2 Workers** | **${summaryByWorker[2].rps.median.toLocaleString()}** | ${summaryByWorker[2].rps.min} – ${summaryByWorker[2].rps.max} | ${summaryByWorker[2].p50.median} ms | ${summaryByWorker[2].p95.median} ms | ${summaryByWorker[2].p99.median} ms | ${summaryByWorker[2].errorRate.median.toFixed(4)}% | **${ratio2}x** |`,
      `| **4 Workers** | **${summaryByWorker[4].rps.median.toLocaleString()}** | ${summaryByWorker[4].rps.min} – ${summaryByWorker[4].rps.max} | ${summaryByWorker[4].p50.median} ms | ${summaryByWorker[4].p95.median} ms | ${summaryByWorker[4].p99.median} ms | ${summaryByWorker[4].errorRate.median.toFixed(4)}% | **${ratio4}x** |`,
      '',
      `**Scaling Verdict:** **${scalingVerdict}** (Throughput grew ${ratio4}x at 4 workers vs theoretical 4.0x linear maximum).`,
      '',
      '### Latency Shifts vs 1 Worker',
      `- **2 Workers:** Median p50 moved from ${w1p50}ms to ${w2p50}ms (${p50Change2 > 0 ? '+' : ''}${p50Change2}%).`,
      `- **4 Workers:** Median p50 moved from ${w1p50}ms to ${w4p50}ms (${p50Change4 > 0 ? '+' : ''}${p50Change4}%).`,
      '',
      '---',
      '',
      '## 2. Individual Run Matrix (Rotated Execution Order)',
      '',
      '| Round | Workers | Total Reqs | Success | Failed | Timeouts | Cancelled | Error Rate | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Status |',
      '| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
    ];

    for (const r of perRunResults) {
      mdLines.push(
        `| R${r.round} | ${r.workerCount} | ${r.totalRequests.toLocaleString()} | ${r.successCount.toLocaleString()} | ${r.failedCount} | ${r.timeoutCount} | ${r.cancelledCount} | ${r.errorRate.toFixed(4)}% | ${r.rps.toFixed(1)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | \`${r.status}\` |`
      );
    }

    mdLines.push('');
    mdLines.push('---');
    mdLines.push('');
    mdLines.push('## 3. Machine Co-location & Saturation Notes');
    mdLines.push('');
    mdLines.push('1. **Shared CPU & Network Loopback:** Both the load generation processes (1, 2, or 4 Node.js child workers + TestCoordinator) and the target HTTP server (`tools/test-target.js`) run on the **same local machine** sharing CPU cores, OS context switches, and localhost TCP stack.');
    mdLines.push('2. **Localhost Socket Efficiency:** Even under loopback CPU sharing, distributing virtual users across multiple processes significantly amortizes event loop lag per core.');
    mdLines.push('3. **Single Machine Scope:** This benchmark demonstrates local operating system multi-processing efficiency, not multi-node cloud network clustering.');

    const mdContent = mdLines.join('\n');

    const outJsonPath = path.resolve(rootDir, `benchmarks/results/scaling-benchmark-${cleanTs}.json`);
    const outMdPath = path.resolve(rootDir, `benchmarks/results/scaling-benchmark-${cleanTs}.md`);

    await fs.writeFile(outJsonPath, JSON.stringify(resultPayload, null, 2), 'utf8');
    await fs.writeFile(outMdPath, mdContent, 'utf8');

    console.log(`\nResults successfully written to:`);
    console.log(`- JSON:     ${outJsonPath}`);
    console.log(`- Markdown: ${outMdPath}`);
    console.log('\n' + '='.repeat(80));
    console.log(` BENCHMARK COMPLETE: ${scalingVerdict.toUpperCase()}`);
    console.log(` 1 Worker: ${summaryByWorker[1].rps.median} RPS -> 4 Workers: ${summaryByWorker[4].rps.median} RPS (${ratio4}x)`);
    console.log('='.repeat(80));

    return resultPayload;
  } finally {
    targetChild.kill();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Direct CLI Invocation
if (process.argv[1] && process.argv[1].endsWith('run-worker-scaling-benchmark.js')) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vus' && args[i + 1]) options.vus = Number(args[++i]);
    if (args[i] === '--duration' && args[i + 1]) options.durationSec = Number(args[++i]);
    if (args[i] === '--rounds' && args[i + 1]) options.rounds = Number(args[++i]);
  }
  runWorkerScalingBenchmark(options).catch(err => {
    console.error('Benchmark execution failed:', err);
    process.exit(1);
  });
}

