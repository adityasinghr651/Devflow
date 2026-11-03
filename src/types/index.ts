export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type Target = {
  id: string;
  userId?: string;
  name: string;
  url: string;
  environment: string;
  verified?: boolean;
  verificationToken?: string;
  verificationMethod?: string;
  verifiedAt?: string;
  isDemo?: boolean;
  createdAt: string;
};

export type Stage = {
  target: number;
  durationSec: number;
};

export type Run = {
  id: string;
  userId?: string;
  targetId: string;
  targetName: string;
  url: string;
  method: string;
  concurrency: number;
  durationSec: number;
  workerCount?: number;
  engine?: string;
  profile?: string;
  stages?: Stage[];
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  status: string;
  startedAt: string;
  finishedAt?: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  httpErrorCount?: number;
  timeoutCount?: number;
  networkErrorCount?: number;
  redirectBlockedCount?: number;
  measurementWindowSec?: number | null;
  cancelledCount?: number;
  partialWorkers?: number[];
  histogramComplete?: boolean;
  isDemo?: boolean;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  statusCodes: Record<string, number>;
  error?: string;
  currentConcurrency?: number;
  progressPercent?: number;
};

export type ThemeMode = 'dark' | 'light' | 'system';

export type LiveMetrics = {
  concurrency?: number;
  progressPercent?: number;
  rps?: number;
  totalRequests?: number;
  successCount?: number;
  failedCount?: number;
  httpErrorCount?: number;
  timeoutCount?: number;
  networkErrorCount?: number;
  redirectBlockedCount?: number;
  measurementWindowSec?: number | null;
  cancelledCount?: number;
  errorRate?: number;
  statusCodes?: Record<string, number>;
};

export type NavItem = {
  name: string;
  icon: any;
  isPublic?: boolean;
};

