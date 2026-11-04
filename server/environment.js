import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitValue(args) {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unknown'; }
}

export function getEnvironmentMetadata(engine = 'node', workerCount = 1) {
  const cpus = os.cpus();
  return {
    engine,
    workerCount,
    nodeVersion: process.version,
    platform: process.platform,
    osRelease: os.release(),
    architecture: process.arch,
    cpuModel: cpus[0]?.model || 'unknown',
    logicalCpuCores: cpus.length,
    totalMemoryBytes: os.totalmem(),
    runnerVersion: process.env.npm_package_version || '0.1.0',
    runnerCommit: gitValue(['rev-parse', 'HEAD']),
  };
}
