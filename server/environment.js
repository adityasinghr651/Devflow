import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function findEnvironmentFile(startDirectory) {
  let current = path.resolve(startDirectory);
  // Worktrees may live a couple of directories below the checkout that owns .env.
  for (let depth = 0; depth <= 3; depth += 1) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function loadEnvironment(startDirectory) {
  const envFile = findEnvironmentFile(startDirectory);
  if (envFile) dotenv.config({ path: envFile });
  return envFile;
}

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
