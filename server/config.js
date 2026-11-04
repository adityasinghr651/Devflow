import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './environment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envFile = loadEnvironment(rootDir);
const envDirectory = envFile ? path.dirname(envFile) : rootDir;

const isProduction = process.env.NODE_ENV === 'production';
const defaultJwtSecret = 'dev-insecure-secret-servertest-local-change-in-prod-32chars';

// In production, require strict secrets and configuration
const jwtSecret = process.env.JWT_SECRET || (isProduction
  ? (() => { throw new Error('FATAL: JWT_SECRET environment variable is mandatory in production.'); })()
  : defaultJwtSecret);

if (isProduction && (jwtSecret === defaultJwtSecret || jwtSecret.length < 32)) {
  throw new Error('FATAL: Production JWT_SECRET must be a non-default secret of at least 32 characters.');
}

const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map(origin => origin.trim()).filter(Boolean);
if (isProduction && corsOrigins.includes('*')) throw new Error('FATAL: Wildcard CORS is not allowed in production.');

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`FATAL: ${name} must be a positive integer.`);
  return value;
}

export const config = {
  isProduction,
  port: Number(process.env.API_PORT || 4000),
  host: process.env.API_HOST || '127.0.0.1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  corsOrigins,
  dataDir: process.env.DATA_DIR ? path.resolve(envDirectory, process.env.DATA_DIR) : path.join(rootDir, 'data'),
  allowLocalTargets: process.env.ALLOW_LOCAL_TARGETS === undefined
    ? !isProduction
    : process.env.ALLOW_LOCAL_TARGETS === 'true',
  maxActiveRuns: Number(process.env.MAX_ACTIVE_RUNS || 1),
  maxConcurrency: 20,
  maxDurationSec: positiveInteger('MAX_DURATION_SEC', 30),
  maxRunsStoredPerUser: positiveInteger('MAX_RUNS_STORED_PER_USER', 1000),
  runnerEngine: (process.env.RUNNER_ENGINE || 'auto').toLowerCase(),
  k6Bin: process.env.K6_BIN || 'k6',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000),
  workerStartupTimeoutMs: positiveInteger('WORKER_STARTUP_TIMEOUT_MS', 30000),
  workerNoProgressTimeoutMs: positiveInteger('WORKER_NO_PROGRESS_TIMEOUT_MS', 15000),
  workerMemoryMb: positiveInteger('WORKER_MEMORY_MB', 512),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60000), // 1 min
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10), // 10 attempts
  maxActiveRunsPerUser: positiveInteger('MAX_ACTIVE_RUNS_PER_USER', 3),
  maxRunsPerDay: positiveInteger('MAX_RUNS_PER_DAY', 100),
  maxVuSecondsPerDay: positiveInteger('MAX_VU_SECONDS_PER_DAY', 36000),
  dbPoolMin: Number(process.env.DB_POOL_MIN || 2),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
};

if (config.maxDurationSec > 3600) {
  throw new Error('FATAL: MAX_DURATION_SEC cannot exceed 3600.');
}
