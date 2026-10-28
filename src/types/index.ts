export type ThemeMode = 'light' | 'dark' | 'system';

export type RouteId =
  // Public Website Routes
  | 'home'
  | 'product'
  | 'docs'
  | 'community'
  // Auth Routes
  | 'auth-signin'
  | 'auth-signup'
  | 'auth-forgot'
  | 'auth-reset'
  | 'auth-verify'
  | 'auth-error'
  | 'auth-expired'
  // Legal & System Routes
  | 'legal-privacy'
  | 'legal-terms'
  | 'legal-security'
  | 'legal-accessibility'
  | 'status-404'
  | 'status-403'
  | 'status-500'
  | 'status-maintenance'
  // Authenticated App Routes
  | 'app-overview'
  | 'app-targets'
  | 'app-create-test'
  | 'app-runs'
  | 'app-live'
  | 'app-analysis'
  | 'app-reports'
  | 'app-comparisons'
  | 'app-integrations'
  | 'app-settings';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: string;
  updatedAt: string | null;
}

export interface TargetConfig {
  baseUrl: string;
  environment: 'local' | 'staging' | 'production' | 'lab';
  healthEndpoint: string;
  verified: boolean;
  verificationMethod: 'header-token' | 'dns-txt' | 'local-loopback';
  lastVerifiedAt: string | null;
  lastHealthStatus: 'healthy' | 'degraded' | 'unreachable' | 'unverified';
  lastLatencyMs: number | null;
  authType: 'none' | 'bearer' | 'header';
  redactedSecretHint?: string;
}

export interface ProjectTarget {
  id: number;
  name: string;
  key: string;
  description: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string | null;
  targetConfig?: TargetConfig;
}

export interface IssueAnomaly {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'closed';
  priority: 'low' | 'medium' | 'high';
  projectId: number | null;
  creatorId: number | null;
  assigneeId: number | null;
  projectName?: string | null;
  projectKey?: string | null;
  creatorName?: string | null;
  assigneeName?: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface IssueComment {
  id: number;
  issueId: number;
  userId: number;
  content: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface PoolTelemetry {
  count: number;
  avgWaitMs: number;
  maxWaitMs: number;
  avgSqlMs: number;
  maxSqlMs: number;
  activeConnections: number;
  idleConnections: number;
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  dbConnectionTimeoutMs: number;
}

export interface LoadRunSeriesPoint {
  sec: number;
  vus: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRatePct: number;
  poolWaitMs: number;
}

export interface LoadRunRecord {
  id: string;
  name: string;
  targetId: number;
  targetName: string;
  targetKey: string;
  baseUrl: string;
  endpointPath: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  testType: 'load' | 'stress' | 'spike' | 'soak';
  status: 'completed' | 'running' | 'failed' | 'cancelled';
  virtualUsers: number;
  durationSec: number;
  elapsedSec?: number;
  rampUpSec: number;
  startedAt: string;
  completedAt: string | null;
  executionSource: 'real-server-probe';
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRatePct: number;
    avgRps: number;
    peakRps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
    statusCodes: Record<string, number>;
    poolWaitAvgMs: number;
    poolWaitMaxMs: number;
    sqlExecAvgMs: number;
    sqlExecMaxMs: number;
  };
  thresholds: {
    p95LimitMs: number;
    errorRateLimitPct: number;
    p95Passed: boolean;
    errorRatePassed: boolean;
  };
  series: LoadRunSeriesPoint[];
}

export interface DiagnosticFinding {
  id: string;
  category:
    | 'Connection Pool Exhaustion'
    | 'Database Query Bottleneck'
    | 'Rate Limiter Throttling'
    | 'SLO Latency Breach'
    | 'Nominal Performance Verified';
  title: string;
  severity: 'high' | 'medium' | 'low';
  observedEvidence: string;
  relevantMetric: string;
  timeRange: string;
  potentialExplanation: string;
  recommendedInvestigation: string;
  confidenceLevel: string;
  linkedProjectId: number;
  sourceFileHint: string;
  sourceRunId?: string;
}

export interface DevToolLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  poolWaitMs: number;
  sqlExecMs: number;
  source: 'user-api' | 'load-probe' | 'health-check';
}
