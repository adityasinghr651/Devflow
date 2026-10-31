import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isProduction = process.env.NODE_ENV === 'production';

// In production, require strict secrets and configuration
const jwtSecret = process.env.JWT_SECRET || (isProduction
  ? (() => { throw new Error('FATAL: JWT_SECRET environment variable is mandatory in production.'); })()
  : 'dev-insecure-secret-servertest-local-change-in-prod-32chars');

export const config = {
  isProduction,
  port: Number(process.env.API_PORT || 4000),
  host: process.env.API_HOST || '127.0.0.1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  allowLocalTargets: process.env.ALLOW_LOCAL_TARGETS !== 'false',
  maxActiveRuns: Number(process.env.MAX_ACTIVE_RUNS || 1),
  maxConcurrency: 20,
  maxDurationSec: 30,
  k6Bin: process.env.K6_BIN || 'k6',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60000), // 1 min
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10), // 10 attempts
  dbPoolMin: Number(process.env.DB_POOL_MIN || 2),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
};
