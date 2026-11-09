export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  tier?: 'demo' | 'free' | 'paid' | 'admin';
  plan?: string;
  lifetimeRuns?: number;
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

export type HistogramTiers = {
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier4Count: number;
  tier5Count: number;
  overflowCount: number;
  tier1Pct: number;
  tier2Pct: number;
  tier3Pct: number;
  tier4Pct: number;
  tier5Pct: number;
  overflowPct: number;
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
  requestTarget?: number | null;
  warmupSec?: number;
  rampUpSec?: number;
  warmupRequests?: number;
  histogramSampleCount?: number;
  workerCount?: number;
  engine?: string;
  assertions?: Record<string, unknown>;
  assertionFailureCount?: number;
  environmentMetadata?: {
    engine: string; workerCount: number; nodeVersion: string; platform: string;
    osRelease: string; architecture: string; cpuModel: string; logicalCpuCores: number;
    totalMemoryBytes: number; runnerVersion: string; runnerCommit: string;
  };
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
  minLatency?: number | null;
  maxLatency?: number | null;
  meanLatency?: number | null;
  tiers?: HistogramTiers;
  errorRate: number;
  statusCodes: Record<string, number>;
  error?: string;
  currentConcurrency?: number;
  progressPercent?: number;
};

export type BenchmarkCampaignStage = {
  number: number;
  requestTarget: number;
  concurrency: number;
  status: string;
  runIds: string[];
  currentRunId?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  report?: Record<string, any> | null;
};

export type BenchmarkCampaign = {
  id: string;
  name: string;
  targetId: string;
  targetName: string;
  path: string;
  method: string;
  concurrency: number;
  stageConcurrency: number[];
  workerCount: number;
  timeoutMs: number;
  warmupSec: number;
  rampUpSec: number;
  maxErrorRatePercent: number;
  status: string;
  currentStage: number;
  currentRunId?: string | null;
  error?: string | null;
  stages: BenchmarkCampaignStage[];
};

export type RegressionMetric = {
  verdict: 'pass' | 'regression' | 'improvement' | 'insufficient_data';
  observed: number;
  median?: number;
  mad?: number;
  scaledMad?: number;
  statisticalBand?: number;
  minimumRelativeChange?: number;
  absoluteMinimumChange?: number;
  threshold?: number;
  band?: { lower: number; upper: number };
  baselineValues?: number[];
};

export type RunRegression = {
  runId: string;
  targetId: string;
  fingerprint: string;
  verdict: 'pass' | 'regression' | 'improvement' | 'insufficient_data';
  reason: string;
  baselineCount: number;
  minimumBaselineRuns: number;
  baselineRunIds: string[];
  mismatchedRunCount?: number;
  metrics: { rps: RegressionMetric; p95: RegressionMetric; p99: RegressionMetric; errorRate: RegressionMetric };
};

export type ThemeMode = 'dark' | 'light' | 'system';

export type LiveMetrics = {
  concurrency?: number;
  progressPercent?: number;
  rps?: number;
  totalRequests?: number;
  p50?: number;
  p95?: number;
  p99?: number;
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

