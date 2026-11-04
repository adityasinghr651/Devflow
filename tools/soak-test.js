import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createTestTargetServer } from './test-target.js';
import { JsonStorage } from '../server/storage/json-storage.js';
import { RunnerManager } from '../server/runner/manager.js';

const durationSec = Math.min(1800, Math.max(60, Number(process.env.SOAK_DURATION_SEC || (process.argv.includes('--ci') ? 120 : 1800))));
const intervalSec = Math.min(60, Math.max(1, Number(process.env.SOAK_SAMPLE_INTERVAL_SEC || 10)));
const concurrency = Math.min(4, Math.max(1, Number(process.env.SOAK_CONCURRENCY || 2)));
const warmupSec = 300;
const outputDir = path.resolve('benchmarks/results');
await fs.mkdir(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const csvPath = path.join(outputDir, `soak-${timestamp}.csv`);
const summaryPath = path.join(outputDir, `soak-${timestamp}-summary.json`);
const target = createTestTargetServer();
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-soak-'));
const storage = new JsonStorage(dataDir);
let runner;
let runId;

function processRssMb(pid) {
  try {
    if (process.platform === 'win32') {
      const bytes = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).WorkingSet64`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return Number(bytes) / 1024 / 1024;
    }
    const text = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return Number(text) / 1024;
  } catch { return null; }
}

function openDescriptorCount() {
  try {
    if (process.platform !== 'win32') return fsSync.readdirSync('/proc/self/fd').length;
  } catch {}
  return null;
}

const fsSync = await import('node:fs');
const rows = ['elapsed_sec,coordinator_rss_mb,worker_rss_mb,worker_heap_used_mb,worker_count,open_descriptors,event_loop_lag_ms'];
let expectedTick = Date.now() + intervalSec * 1000;
const samples = [];

try {
  process.env.RUNNER_ENGINE = 'node';
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  await storage.init();
  runner = new RunnerManager(storage);
  const port = target.address().port;
  runId = `soak-${Date.now()}`;
  await storage.createRun({ id: runId, userId: 'soak-user', targetId: 'local', targetName: 'loopback controlled target', url: `http://127.0.0.1:${port}/health`, method: 'GET', concurrency, durationSec, timeoutMs: 5000, status: 'queued' });
  await runner.enqueueRun(await storage.getRunById(runId));
  const started = Date.now();
  let done = false;
  while (!done) {
    await new Promise(resolve => setTimeout(resolve, Math.max(100, expectedTick - Date.now())));
    const now = Date.now();
    const active = runner.activeRuns.get(runId);
    const workerPids = active?.coordinator?.getWorkerPids?.() || [];
    const workerRss = workerPids.map(processRssMb).filter(Number.isFinite);
    const workerHeap = active?.coordinator?.workers?.map(worker => worker.heapUsedBytes).filter(Number.isFinite) || [];
    const coordinatorRss = process.memoryUsage().rss / 1024 / 1024;
    const row = [((now - started) / 1000).toFixed(1), coordinatorRss.toFixed(2), workerRss.length ? Math.max(...workerRss).toFixed(2) : '', workerHeap.length ? (Math.max(...workerHeap) / 1024 / 1024).toFixed(2) : '', workerPids.length, openDescriptorCount() ?? '', Math.max(0, now - expectedTick).toFixed(1)].join(',');
    rows.push(row);
    samples.push({ elapsedSec: (now - started) / 1000, coordinatorRssMb: coordinatorRss, workerRssMb: workerRss.length ? Math.max(...workerRss) : null, workerHeapUsedMb: workerHeap.length ? Math.max(...workerHeap) / 1024 / 1024 : null });
    expectedTick += intervalSec * 1000;
    const saved = await storage.getRunById(runId);
    done = ['completed', 'failed', 'cancelled', 'timed_out'].includes(saved?.status);
  }
  await fs.writeFile(csvPath, `${rows.join('\n')}\n`);
  const warmSamples = samples.filter(sample => sample.elapsedSec >= warmupSec);
  const warm = warmSamples.map(sample => sample.coordinatorRssMb);
  const workerRssValues = warmSamples.map(sample => sample.workerRssMb).filter(Number.isFinite);
  const workerHeapValues = warmSamples.map(sample => sample.workerHeapUsedMb).filter(Number.isFinite);
  const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? null; };
  const medianRss = median(warm);
  const spreadMb = warm.length ? Math.max(...warm) - Math.min(...warm) : null;
  const workerMedianRss = median(workerRssValues);
  const workerRssSpreadMb = workerRssValues.length ? Math.max(...workerRssValues) - Math.min(...workerRssValues) : null;
  const workerHeapMedianMb = median(workerHeapValues);
  const workerHeapSpreadMb = workerHeapValues.length ? Math.max(...workerHeapValues) - Math.min(...workerHeapValues) : null;
  const coordinatorPass = medianRss !== null && spreadMb <= Math.max(50, medianRss * 0.2);
  const workerRssPass = workerMedianRss !== null && workerRssSpreadMb <= Math.max(50, workerMedianRss * 0.2);
  const workerHeapPass = workerHeapMedianMb !== null && workerHeapSpreadMb <= Math.max(64, workerHeapMedianMb * 0.25);
  const summary = {
    status: (await storage.getRunById(runId)).status,
    workload: { target: '/health on self-started 127.0.0.1 target', method: 'GET', concurrency, workerCount: 1, engine: 'node' },
    durationSec,
    sampleIntervalSec: intervalSec,
    samples: samples.length,
    warmupSec,
    passCriterion: 'After 300 seconds warm-up, coordinator and worker RSS spread must each be <= max(50 MiB, 20% of median RSS), and worker heap spread <= max(64 MiB, 25% of median heap). File descriptors and event-loop lag are also recorded.',
    coordinatorRssWarmupMedianMb: medianRss,
    coordinatorRssWarmupSpreadMb: spreadMb,
    coordinatorRssCriterionPassed: coordinatorPass,
    workerRssWarmupMedianMb: workerMedianRss,
    workerRssWarmupSpreadMb: workerRssSpreadMb,
    workerRssCriterionPassed: workerRssPass,
    workerRssObserved: samples.some(sample => sample.workerRssMb !== null),
    workerHeapUsedMbWarmupMedian: workerHeapMedianMb,
    workerHeapUsedMbWarmupSpread: workerHeapSpreadMb,
    workerHeapCriterionPassed: workerHeapPass,
    environment: { node: process.version, platform: process.platform, release: os.release(), cpu: os.cpus()[0]?.model, logicalCores: os.cpus().length, totalMemoryBytes: os.totalmem(), runnerPid: process.pid },
    csv: path.basename(csvPath),
  };
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ csvPath, summaryPath, ...summary }, null, 2));
  if (summary.status !== 'completed' || !summary.coordinatorRssCriterionPassed || !summary.workerRssCriterionPassed || !summary.workerHeapCriterionPassed) process.exitCode = 1;
} finally {
  if (runner) await runner.shutdown(5000);
  await new Promise(resolve => target.close(resolve));
  await storage.writeQueue;
  await fs.rm(dataDir, { recursive: true, force: true });
}
