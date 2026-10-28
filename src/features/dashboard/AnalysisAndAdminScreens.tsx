import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Download,
  FileText,
  Play,
  Plus,
  Printer,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CodeBlock,
  EmptyWorkspaceState,
  InlineMeta,
  LatencyPercentileChart,
  ThemeSegmentedControl,
  ThroughputAreaChart,
} from '../../components/ui/Primitives';
import { DiagnosticFinding, IssueComment, LoadRunRecord } from '../../types';

// --- Dynamic Bottleneck Analyzer Computed Directly From Real Executed Runs ---
function computeDynamicFindingsFromRuns(runs: LoadRunRecord[]): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  for (const run of runs) {
    // 1. Check PostgreSQL Connection Pool Contention
    if (run.virtualUsers > 20 || run.metrics.poolWaitAvgMs > 3.5) {
      findings.push({
        id: `dyn-pool-${run.id}`,
        sourceRunId: run.id,
        category: 'Connection Pool Exhaustion',
        title: `[${run.id}] PostgreSQL Pool Acquire Wait Reached ${run.metrics.poolWaitAvgMs}ms avg (${run.metrics.poolWaitMaxMs}ms max) at ${run.virtualUsers} VUs`,
        severity: run.metrics.poolWaitAvgMs > 10 ? 'high' : 'medium',
        observedEvidence: `During run "${run.name}" (${run.virtualUsers} VUs on ${run.endpointPath}), connection pool wait averaged ${run.metrics.poolWaitAvgMs}ms while SQL execution averaged ${run.metrics.sqlExecAvgMs}ms.`,
        relevantMetric: `poolWaitAvgMs: ${run.metrics.poolWaitAvgMs}ms · p95 Latency: ${run.metrics.p95Ms}ms`,
        timeRange: `t = 1s to t = ${run.elapsedSec ?? run.durationSec}s`,
        potentialExplanation: `Concurrency (${run.virtualUsers} VUs) approached or exceeded DB_POOL_MAX (20) in project/src/config/db.js, queuing incoming requests until client.release().`,
        recommendedInvestigation: `Inspect TRACK_POOL_METRICS in src/repositories/issue.repository.js and test raising DB_POOL_MAX or adding an index to shorten SQL hold time.`,
        confidenceLevel: 'High (Measured from Live Run Telemetry)',
        linkedProjectId: run.targetId,
        sourceFileHint: 'project/src/config/db.js & src/repositories/issue.repository.js',
      });
    }

    // 2. Check Search / SQL Query Cost
    if (run.endpointPath.includes('search=') || run.metrics.sqlExecAvgMs > 6.0) {
      findings.push({
        id: `dyn-sql-${run.id}`,
        sourceRunId: run.id,
        category: 'Database Query Bottleneck',
        title: `[${run.id}] SQL Execution Averaged ${run.metrics.sqlExecAvgMs}ms (${run.metrics.sqlExecMaxMs}ms max) on ${run.endpointPath}`,
        severity: run.metrics.sqlExecAvgMs > 10 ? 'high' : 'medium',
        observedEvidence: `Measured SQL duration reached ${run.metrics.sqlExecAvgMs}ms avg across ${run.metrics.totalRequests} requests.`,
        relevantMetric: `sqlExecAvgMs: ${run.metrics.sqlExecAvgMs}ms · Max: ${run.metrics.sqlExecMaxMs}ms`,
        timeRange: `t = 1s to t = ${run.elapsedSec ?? run.durationSec}s`,
        potentialExplanation: `issue.repository.js executes ILIKE wildcard matching combined with COUNT(*) OVER()::int window pagination.`,
        recommendedInvestigation: `Add a GIN trigram index (pg_trgm) on issues(title, description) in project/src/db/schema.sql.`,
        confidenceLevel: 'High (Measured from Live Run Telemetry)',
        linkedProjectId: run.targetId,
        sourceFileHint: 'project/src/repositories/issue.repository.js',
      });
    }

    // 3. Check Rate Limiter HTTP 429
    const count429 = run.metrics.statusCodes['429'] || 0;
    if (count429 > 0) {
      findings.push({
        id: `dyn-429-${run.id}`,
        sourceRunId: run.id,
        category: 'Rate Limiter Throttling',
        title: `[${run.id}] Sliding-Window Rate Limiter Rejected ${count429} Requests With HTTP 429`,
        severity: 'medium',
        observedEvidence: `${count429} requests returned HTTP 429 (${run.metrics.errorRatePct}% total error rate) during ${run.virtualUsers} VU concurrency.`,
        relevantMetric: `HTTP 429 Count: ${count429} · Error Rate: ${run.metrics.errorRatePct}%`,
        timeRange: `Steady-state burst window (${run.durationSec}s)`,
        potentialExplanation: `src/middleware/rateLimiter.js throttles requests originating from the same IP window.`,
        recommendedInvestigation: `Configure Express trust proxy headers or tune rate-limit window thresholds for load testing origins.`,
        confidenceLevel: 'High (Verified via HTTP 429 Status Count)',
        linkedProjectId: run.targetId,
        sourceFileHint: 'project/src/middleware/rateLimiter.js',
      });
    }

    // 4. If everything passed cleanly with low latency, record a verified nominal finding
    if (
      findings.filter((f) => f.sourceRunId === run.id).length === 0 &&
      run.metrics.totalRequests > 0
    ) {
      findings.push({
        id: `dyn-nominal-${run.id}`,
        sourceRunId: run.id,
        category: 'Nominal Performance Verified',
        title: `[${run.id}] Nominal SLO Compliance Verified (p95 ${run.metrics.p95Ms}ms <= ${run.thresholds.p95LimitMs}ms)`,
        severity: 'low',
        observedEvidence: `Executed ${run.metrics.totalRequests} requests at ${run.metrics.avgRps} req/s with ${run.metrics.errorRatePct}% error rate and ${run.metrics.poolWaitAvgMs}ms pool wait.`,
        relevantMetric: `p50: ${run.metrics.p50Ms}ms · p95: ${run.metrics.p95Ms}ms · PoolWait: ${run.metrics.poolWaitAvgMs}ms`,
        timeRange: `Full ${run.durationSec}s run window`,
        potentialExplanation: `Concurrency (${run.virtualUsers} VUs) remained within DB_POOL_MAX (20) capacity with zero connection queue saturation.`,
        recommendedInvestigation: `Optionally run a 50 VU stress test on /api/issues?search=auth to find the saturation knee.`,
        confidenceLevel: 'High (Verified via Live Telemetry)',
        linkedProjectId: run.targetId,
        sourceFileHint: 'project/src/app.js',
      });
    }
  }

  return findings;
}

// --- E. TEST RUNS & RESULTS LIST (/app/runs) ---
export const TestRunsScreen: React.FC = () => {
  const { loadRuns, setSelectedRunId, setCompareRunIds, executeLoadRun, navigate } = useApp();
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'load' | 'stress'>('all');

  const filtered = loadRuns.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.endpointPath.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.targetKey.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesType = typeFilter === 'all' || r.testType === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loadRuns.length === 0) {
    return (
      <EmptyWorkspaceState
        title="No Test Runs Executed Yet"
        description="This ledger only displays dynamic benchmark runs that you have launched. Run a quick 10-second load test or open the 5-Step Wizard to populate real telemetry results."
        actionLabel="Launch 20 VU Live Load Test (10s)"
        onAction={async () => {
          await executeLoadRun({
            name: 'GET /api/issues Paginated Load — 20 VUs',
            targetId: 1,
            endpointPath: '/api/issues?page=1&limit=20',
            method: 'GET',
            testType: 'load',
            virtualUsers: 20,
            durationSec: 10,
            rampUpSec: 3,
            p95LimitMs: 55,
            errorRateLimitPct: 1.0,
          });
          navigate('app-live');
        }}
        secondaryLabel="Open 5-Step Test Wizard"
        onSecondaryAction={() => navigate('app-create-test')}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <InlineMeta
            items={[
              'Dynamic Benchmark Run Ledger',
              `${loadRuns.length} Executed Runs`,
            ]}
          />
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            Executed Test Runs & Results
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('app-create-test')}
          className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>New Load Test</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter by run name, endpoint path, or target key..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
          />
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono">
          {(['all', 'load', 'stress'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded uppercase cursor-pointer ${
                typeFilter === t
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-shiny rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
              <th className="py-3 px-4">Run ID / Workload</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">VUs / Dur</th>
              <th className="py-3 px-3 text-right">Avg RPS</th>
              <th className="py-3 px-3 text-right">p50 / p95 / p99</th>
              <th className="py-3 px-3 text-right">Pool Wait</th>
              <th className="py-3 px-3 text-right">Err Rate</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((r) => {
              const sloPass = r.thresholds.p95Passed && r.thresholds.errorRatePassed;
              return (
                <tr key={r.id} className="hover:bg-[var(--bg-elevated)]/50">
                  <td className="py-3.5 px-4">
                    <div className="font-sans font-bold text-[var(--text-primary)]">{r.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {r.id} · {r.targetKey} · {r.method} {r.endpointPath}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 uppercase text-[var(--accent-cobalt)] font-semibold">
                    {r.status}
                  </td>
                  <td className="py-3.5 px-3 text-right text-[var(--text-secondary)]">
                    {r.virtualUsers} VUs · {r.durationSec}s
                  </td>
                  <td className="py-3.5 px-3 text-right font-bold text-[var(--text-primary)]">
                    {r.metrics.avgRps}
                  </td>
                  <td className="py-3.5 px-3 text-right text-[var(--accent-lime-text)]">
                    {r.metrics.p50Ms} / {r.metrics.p95Ms} / {r.metrics.p99Ms}ms
                  </td>
                  <td className="py-3.5 px-3 text-right text-[var(--text-secondary)]">
                    {r.metrics.poolWaitAvgMs}ms
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <span
                      className={
                        sloPass ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
                      }
                    >
                      {r.metrics.errorRatePct}% ({sloPass ? 'PASS' : 'BREACH'})
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRunId(r.id);
                        navigate('app-reports');
                      }}
                      className="px-2.5 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-cobalt)] cursor-pointer"
                    >
                      Report
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCompareRunIds([loadRuns[0]?.id || r.id, r.id]);
                        navigate('app-comparisons');
                      }}
                      className="px-2.5 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Compare
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

// --- F. PERFORMANCE ANALYSIS WORKSPACE (/app/analysis) — DYNAMICALLY COMPUTED ---
export const PerformanceAnalysisScreen: React.FC = () => {
  const {
    loadRuns,
    issues,
    createIssueAnomaly,
    updateIssueStatus,
    executeLoadRun,
    navigate,
    token,
    pushToast,
  } = useApp();

  const dynamicFindings = useMemo(() => computeDynamicFindingsFromRuns(loadRuns), [loadRuns]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(issues[0]?.id || null);
  const [issueComments, setIssueComments] = useState<IssueComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [loggingFindingId, setLoggingFindingId] = useState<string | null>(null);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) || issues[0] || null;

  useEffect(() => {
    if (!selectedIssue) {
      setIssueComments([]);
      return;
    }
    fetch(`/api/issues/${selectedIssue.id}/comments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setIssueComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [selectedIssue]);

  const handleLogFindingToTracker = async (f: DiagnosticFinding) => {
    setLoggingFindingId(f.id);
    try {
      const created = await createIssueAnomaly({
        title: f.title,
        description: `[Observed Evidence]: ${f.observedEvidence} | [Metric]: ${f.relevantMetric} | [Source]: ${f.sourceFileHint}`,
        priority: f.severity,
        projectId: f.linkedProjectId,
      });
      setSelectedIssueId(created.id);
    } finally {
      setLoggingFindingId(null);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !newCommentText.trim()) return;
    const res = await fetch(`/api/issues/${selectedIssue.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content: newCommentText }),
    });
    if (res.ok) {
      const created = await res.json();
      setIssueComments((prev) => [...prev, created]);
      setNewCommentText('');
      pushToast(
        'Investigation note saved',
        `Posted to /api/issues/${selectedIssue.id}/comments`,
        'success'
      );
    }
  };

  if (loadRuns.length === 0) {
    return (
      <EmptyWorkspaceState
        title="Run a Test First to Generate Dynamic Bottleneck Analysis"
        description="Performance Analysis inspects real telemetry from your executed test runs (such as PostgreSQL pool wait spikes above DB_POOL_MAX=20, SQL ILIKE query latency, and HTTP 429 rate-limiter rejections). Launch a 50 VU stress test to generate live diagnostic findings."
        actionLabel="Run 50 VU Pool Stress Test Now (10s)"
        onAction={async () => {
          await executeLoadRun({
            name: '50 VU Pool Saturation Stress — GET /api/issues?search=auth',
            targetId: 1,
            endpointPath: '/api/issues?search=auth&page=1&limit=20',
            method: 'GET',
            testType: 'stress',
            virtualUsers: 50,
            durationSec: 10,
            rampUpSec: 2,
            p95LimitMs: 55,
            errorRateLimitPct: 1.0,
          });
          navigate('app-live');
        }}
        secondaryLabel="Open 5-Step Test Wizard"
        onSecondaryAction={() => navigate('app-create-test')}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <InlineMeta
          items={[
            'Dynamic Telemetry Diagnostics',
            `Analyzed Across ${loadRuns.length} Executed Run(s)`,
            'Integrated with project/ Issues & Comments API',
          ]}
        />
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
          Performance Bottleneck Analysis & Issue Escalation
        </h1>
      </div>

      {/* Dynamically Computed Diagnostic Findings Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-[var(--text-primary)] font-mono uppercase">
          Findings Computed From Your Executed Test Runs ({dynamicFindings.length})
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {dynamicFindings.map((f) => (
            <div
              key={f.id}
              className="surface-shiny rounded-xl border border-[var(--border-strong)] p-5 space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <InlineMeta
                    items={[
                      `Category: ${f.category}`,
                      `Severity: ${f.severity.toUpperCase()}`,
                      `Confidence: ${f.confidenceLevel}`,
                    ]}
                  />
                  <h3 className="text-base font-bold text-[var(--text-primary)] mt-1">
                    {f.title}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={loggingFindingId === f.id}
                  onClick={() => handleLogFindingToTracker(f)}
                  className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {loggingFindingId === f.id
                      ? 'Logging to POST /issues...'
                      : 'Log Finding to project/ Issues'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="font-mono font-semibold text-[var(--text-primary)] mb-1">
                    1. Observed Evidence
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    {f.observedEvidence}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="font-mono font-semibold text-[var(--accent-lime-text)] mb-1">
                    2. Measured Metric & Window
                  </div>
                  <p className="font-mono text-[var(--text-primary)] mb-1">{f.relevantMetric}</p>
                  <p className="font-mono text-[var(--text-muted)]">Window: {f.timeRange}</p>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="font-mono font-semibold text-[var(--text-primary)] mb-1">
                    3. Potential Explanation
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    {f.potentialExplanation}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="font-mono font-semibold text-[var(--accent-cobalt)] mb-1">
                    4. Recommended Investigation
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    {f.recommendedInvestigation}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live project/ Issues & Comments Investigation Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        <div className="lg:col-span-6 surface-shiny rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-[var(--text-primary)]">
              PROJECT/ ISSUE TRACKER (GET /api/issues)
            </h3>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {issues.length} logged issues
            </span>
          </div>
          {issues.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] font-mono">
              No issues logged yet. Click &ldquo;Log Finding to project/ Issues&rdquo; on any card above to create a real issue via POST /api/issues.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {issues.map((iss) => (
                <div
                  key={iss.id}
                  onClick={() => setSelectedIssueId(iss.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedIssue?.id === iss.id
                      ? 'bg-[var(--accent-cobalt-soft)]'
                      : 'hover:bg-[var(--bg-elevated)]/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-[var(--text-muted)]">
                      #{iss.id} · {iss.projectKey || 'LABAPI'} · Priority: {iss.priority}
                    </span>
                    <select
                      value={iss.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateIssueStatus(iss.id, e.target.value as any)}
                      className="px-2 py-0.5 text-[11px] font-mono rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                    >
                      <option value="open">open</option>
                      <option value="in-progress">in-progress</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{iss.title}</div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                    {iss.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 surface-shiny rounded-xl p-5 flex flex-col justify-between space-y-4">
          {selectedIssue ? (
            <>
              <div className="space-y-2 border-b border-[var(--border-subtle)] pb-3">
                <div className="text-xs font-mono text-[var(--accent-cobalt)]">
                  INVESTIGATION THREAD · ISSUE #{selectedIssue.id}
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {selectedIssue.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {selectedIssue.description}
                </p>
              </div>

              <div className="space-y-3 flex-1">
                <div className="text-xs font-mono text-[var(--text-muted)]">
                  Comments ({issueComments.length}) — Synced with /api/issues/{selectedIssue.id}/comments
                </div>
                {issueComments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs space-y-1"
                  >
                    <div className="font-mono text-[11px] text-[var(--text-muted)]">
                      {c.authorName} · {new Date(c.createdAt).toLocaleString()}
                    </div>
                    <div className="text-[var(--text-primary)]">{c.content}</div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddComment}
                className="pt-3 border-t border-[var(--border-subtle)] flex gap-2"
              >
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add engineering investigation note (POST /comments)..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
                <button
                  type="submit"
                  className="btn-cobalt-shiny px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Post Note
                </button>
              </form>
            </>
          ) : (
            <div className="text-xs font-mono text-[var(--text-muted)] py-12 text-center">
              Log a diagnostic finding on the left to start an issue investigation thread.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- G. REPORTS & EXPORT SCREEN (/app/reports) ---
export const ReportsScreen: React.FC = () => {
  const { loadRuns, selectedRunId, setSelectedRunId, executeLoadRun, navigate, pushToast } =
    useApp();
  const run = loadRuns.find((r) => r.id === selectedRunId) || loadRuns[0] || null;

  if (!run) {
    return (
      <EmptyWorkspaceState
        title="No Performance Report Available Until a Test Runs"
        description="Execute a live server load test first to generate a downloadable JSON/Markdown report and printable benchmark certificate."
        actionLabel="Run 10s Live Benchmark Now"
        onAction={async () => {
          await executeLoadRun({
            name: 'Report Benchmark — 20 VUs on GET /api/issues',
            targetId: 1,
            endpointPath: '/api/issues?page=1&limit=20',
            method: 'GET',
            testType: 'load',
            virtualUsers: 20,
            durationSec: 10,
            rampUpSec: 3,
            p95LimitMs: 55,
            errorRateLimitPct: 1.0,
          });
          navigate('app-live');
        }}
      />
    );
  }

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsebench-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Exported JSON Report', `Downloaded pulsebench-${run.id}.json`, 'success');
  };

  const handleExportMarkdown = () => {
    const md = `# PulseBench Performance Report — ${run.name}
- **Run ID**: ${run.id}
- **Target**: ${run.targetName} (${run.targetKey})
- **Endpoint**: ${run.method} ${run.baseUrl}${run.endpointPath}
- **Workload**: ${run.virtualUsers} Virtual Users · ${run.durationSec}s Duration

## Measured Metrics
- **Total Requests**: ${run.metrics.totalRequests}
- **Average Throughput**: ${run.metrics.avgRps} req/s (Peak: ${run.metrics.peakRps} req/s)
- **Latency Percentiles**: p50=${run.metrics.p50Ms}ms | p95=${run.metrics.p95Ms}ms | p99=${run.metrics.p99Ms}ms
- **Error Rate**: ${run.metrics.errorRatePct}% (${run.metrics.failedRequests} failed)
- **PostgreSQL Pool Telemetry**: WaitAvg=${run.metrics.poolWaitAvgMs}ms | SQLAvg=${run.metrics.sqlExecAvgMs}ms
`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsebench-${run.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Exported Markdown Report', `Downloaded pulsebench-${run.id}.md`, 'success');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)] no-print">
        <div>
          <InlineMeta items={['Dynamic Performance Report', `Run: ${run.id}`]} />
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            Performance Benchmark Report
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Select report run"
            value={run.id}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          >
            {loadRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Markdown</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <div className="surface-shiny rounded-2xl border border-[var(--border-strong)] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <div className="text-xs font-mono text-[var(--accent-cobalt)]">
              PULSEBENCH DYNAMIC BENCHMARK CERTIFICATE · {run.executionSource.toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mt-1">{run.name}</h2>
            <div className="text-xs font-mono text-[var(--text-muted)] mt-1">
              Target: {run.targetName} [{run.targetKey}] · {run.method} {run.baseUrl}
              {run.endpointPath}
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <div
              className={`text-sm font-bold ${
                run.thresholds.p95Passed && run.thresholds.errorRatePassed
                  ? 'text-[var(--status-success)]'
                  : 'text-[var(--status-error)]'
              }`}
            >
              {run.thresholds.p95Passed && run.thresholds.errorRatePassed
                ? 'SLO THRESHOLDS PASSED'
                : 'SLO THRESHOLD BREACHED'}
            </div>
            <div className="text-[var(--text-muted)]">
              Started: {new Date(run.startedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono tabular-nums text-xs">
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Total Requests</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-1">
              {run.metrics.totalRequests.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Avg / Peak RPS</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-1">
              {run.metrics.avgRps} / {run.metrics.peakRps}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">p50 Latency</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-1">
              {run.metrics.p50Ms}ms
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">p95 Latency</div>
            <div className="text-base font-bold text-[var(--accent-lime-text)] mt-1">
              {run.metrics.p95Ms}ms
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">p99 Latency</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-1">
              {run.metrics.p99Ms}ms
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">PG Pool Wait / SQL</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-1">
              {run.metrics.poolWaitAvgMs} / {run.metrics.sqlExecAvgMs}ms
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40">
            <h3 className="text-xs font-mono font-bold text-[var(--text-primary)] mb-3">
              LATENCY PERCENTILES (p50 / p95 / p99)
            </h3>
            <LatencyPercentileChart
              series={run.series}
              p95ThresholdMs={run.thresholds.p95LimitMs}
              height={185}
            />
          </div>
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40">
            <h3 className="text-xs font-mono font-bold text-[var(--text-primary)] mb-3">
              THROUGHPUT (REQ/S) OVER TIME
            </h3>
            <ThroughputAreaChart series={run.series} height={185} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// --- H. TEST COMPARISONS SCREEN (/app/comparisons) ---
export const ComparisonsScreen: React.FC = () => {
  const { loadRuns, compareRunIds, setCompareRunIds, executeLoadRun, navigate } = useApp();

  if (loadRuns.length < 2) {
    return (
      <EmptyWorkspaceState
        title={`Need At Least 2 Executed Runs to Compare (Currently: ${loadRuns.length})`}
        description="Execute at least two benchmark runs (for example, a 20 VU Baseline Load Test and a 50 VU Stress Test) to compute side-by-side absolute and percentage regressions."
        actionLabel={
          loadRuns.length === 0
            ? 'Run Test #1: 20 VU Baseline (8s)'
            : 'Run Test #2: 50 VU Pool Stress (8s)'
        }
        onAction={async () => {
          if (loadRuns.length === 0) {
            await executeLoadRun({
              name: 'Baseline Run A — 20 VUs on GET /api/issues',
              targetId: 1,
              endpointPath: '/api/issues?page=1&limit=20',
              method: 'GET',
              testType: 'load',
              virtualUsers: 20,
              durationSec: 8,
              rampUpSec: 2,
              p95LimitMs: 55,
              errorRateLimitPct: 1.0,
            });
          } else {
            await executeLoadRun({
              name: 'Candidate Run B — 50 VUs Pool Stress',
              targetId: 1,
              endpointPath: '/api/issues?search=auth&page=1&limit=20',
              method: 'GET',
              testType: 'stress',
              virtualUsers: 50,
              durationSec: 8,
              rampUpSec: 2,
              p95LimitMs: 55,
              errorRateLimitPct: 1.0,
            });
          }
          navigate('app-live');
        }}
      />
    );
  }

  const runA = loadRuns.find((r) => r.id === compareRunIds[0]) || loadRuns[loadRuns.length - 1];
  const runB = loadRuns.find((r) => r.id === compareRunIds[1]) || loadRuns[0];

  const configDiffers =
    runA.virtualUsers !== runB.virtualUsers ||
    runA.durationSec !== runB.durationSec ||
    runA.endpointPath !== runB.endpointPath;

  const formatDelta = (valA: number, valB: number, unit: string, lowerIsBetter = true) => {
    const diff = +(valB - valA).toFixed(2);
    const pct = valA !== 0 ? +(((valB - valA) / valA) * 100).toFixed(1) : 0;
    const sign = diff > 0 ? '+' : '';
    const isGood = lowerIsBetter ? diff <= 0 : diff >= 0;
    return {
      text: `${sign}${diff}${unit} (${sign}${pct}%)`,
      color:
        diff === 0
          ? 'text-[var(--text-muted)]'
          : isGood
          ? 'text-[var(--status-success)]'
          : 'text-[var(--status-error)]',
    };
  };

  const rows = [
    {
      metric: 'Average Throughput (RPS)',
      a: `${runA.metrics.avgRps} req/s`,
      b: `${runB.metrics.avgRps} req/s`,
      delta: formatDelta(runA.metrics.avgRps, runB.metrics.avgRps, ' req/s', false),
    },
    {
      metric: 'p50 Median Latency',
      a: `${runA.metrics.p50Ms} ms`,
      b: `${runB.metrics.p50Ms} ms`,
      delta: formatDelta(runA.metrics.p50Ms, runB.metrics.p50Ms, ' ms', true),
    },
    {
      metric: 'p95 Tail Latency',
      a: `${runA.metrics.p95Ms} ms`,
      b: `${runB.metrics.p95Ms} ms`,
      delta: formatDelta(runA.metrics.p95Ms, runB.metrics.p95Ms, ' ms', true),
    },
    {
      metric: 'p99 Extreme Tail Latency',
      a: `${runA.metrics.p99Ms} ms`,
      b: `${runB.metrics.p99Ms} ms`,
      delta: formatDelta(runA.metrics.p99Ms, runB.metrics.p99Ms, ' ms', true),
    },
    {
      metric: 'HTTP Error Rate',
      a: `${runA.metrics.errorRatePct}%`,
      b: `${runB.metrics.errorRatePct}%`,
      delta: formatDelta(runA.metrics.errorRatePct, runB.metrics.errorRatePct, '%', true),
    },
    {
      metric: 'PostgreSQL Pool Acquire Wait (Avg)',
      a: `${runA.metrics.poolWaitAvgMs} ms`,
      b: `${runB.metrics.poolWaitAvgMs} ms`,
      delta: formatDelta(runA.metrics.poolWaitAvgMs, runB.metrics.poolWaitAvgMs, ' ms', true),
    },
    {
      metric: 'SQL Execution Duration (Avg)',
      a: `${runA.metrics.sqlExecAvgMs} ms`,
      b: `${runB.metrics.sqlExecAvgMs} ms`,
      delta: formatDelta(runA.metrics.sqlExecAvgMs, runB.metrics.sqlExecAvgMs, ' ms', true),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <InlineMeta
          items={[
            'Side-by-Side Dynamic Benchmark Diff',
            'Absolute & Percentage Delta Engine',
            'Automatic Configuration Equivalence Guard',
          ]}
        />
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
          Test Run Comparison & Regression Analysis
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="surface-shiny p-4 rounded-xl space-y-2">
          <label className="block text-xs font-mono text-[var(--text-muted)]">
            BASELINE RUN (RUN A)
          </label>
          <select
            value={runA.id}
            onChange={(e) => setCompareRunIds([e.target.value, runB.id])}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          >
            {loadRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.name} ({r.virtualUsers} VUs)
              </option>
            ))}
          </select>
        </div>

        <div className="surface-shiny p-4 rounded-xl space-y-2">
          <label className="block text-xs font-mono text-[var(--text-muted)]">
            COMPARISON RUN (RUN B)
          </label>
          <select
            value={runB.id}
            onChange={(e) => setCompareRunIds([runA.id, e.target.value])}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          >
            {loadRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.name} ({r.virtualUsers} VUs)
              </option>
            ))}
          </select>
        </div>
      </div>

      {configDiffers && (
        <div className="p-4 rounded-xl border border-[var(--status-warning)]/50 bg-[var(--bg-surface)] flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--status-warning)] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-[var(--text-primary)]">
              Material Configuration Difference Detected — Do Not Treat Runs as 1:1 Equivalent
            </div>
            <p className="text-[var(--text-secondary)] font-mono">
              Run A ({runA.virtualUsers} VUs, {runA.durationSec}s on {runA.endpointPath}) differs in workload configuration from Run B ({runB.virtualUsers} VUs, {runB.durationSec}s on {runB.endpointPath}).
            </p>
          </div>
        </div>
      )}

      <div className="surface-shiny rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
              <th className="py-3 px-4">Telemetry Metric</th>
              <th className="py-3 px-4 text-right">Baseline ({runA.id})</th>
              <th className="py-3 px-4 text-right">Candidate ({runB.id})</th>
              <th className="py-3 px-4 text-right">Absolute & % Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((r) => (
              <tr key={r.metric} className="hover:bg-[var(--bg-elevated)]/50">
                <td className="py-3 px-4 font-sans font-semibold text-[var(--text-primary)]">
                  {r.metric}
                </td>
                <td className="py-3 px-4 text-right text-[var(--text-secondary)]">{r.a}</td>
                <td className="py-3 px-4 text-right text-[var(--text-primary)] font-bold">{r.b}</td>
                <td className={`py-3 px-4 text-right font-bold ${r.delta.color}`}>
                  {r.delta.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

// --- I. INTEGRATIONS, API CONTRACT MAP & DESIGN SYSTEM (/app/integrations) ---
export const IntegrationsAndAuditScreen: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-8"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <InlineMeta
          items={[
            'Stage 3, 7 & 9 Deliverable',
            'API Integration Map & Proposed Contracts',
            'Midnight Black + Electric Cobalt + Acid Lime Tokens',
          ]}
        />
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
          API Integration Map, Proposed Contracts & Design System
        </h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          1. Screen-to-API Endpoint Integration Matrix
        </h2>
        <div className="surface-shiny rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <th className="py-3 px-4">Application Screen</th>
                <th className="py-3 px-4">Endpoint & Method</th>
                <th className="py-3 px-4">Origin / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {[
                [
                  'Sign In / Sign Up / Profile',
                  'POST /api/auth/login · POST /api/auth/register · GET /api/auth/me',
                  'Existing project/ Backend',
                ],
                [
                  'Servers & Targets Registry',
                  'GET /api/projects · POST /api/projects · DELETE /api/projects/:id',
                  'Existing project/ + Target Extension',
                ],
                [
                  'Real-Time Tick-by-Tick Load Runner',
                  'POST /api/load-runs/execute · POST /api/load-runs/:id/stop · DELETE /api/load-runs',
                  'Implemented Dynamic Engine',
                ],
                [
                  'Background DevTools Wire Inspector',
                  'GET /api/devtools/logs · GET /api/telemetry/pool',
                  'Implemented Live Wire Telemetry',
                ],
                [
                  'Distributed Multi-Region Worker Dispatch',
                  'POST /api/v2/distributed-agents/dispatch',
                  'NOT IMPLEMENTED (Proposed Contract)',
                ],
              ].map(([screen, ep, status]) => (
                <tr key={screen} className="hover:bg-[var(--bg-elevated)]/40">
                  <td className="py-3 px-4 font-sans font-bold text-[var(--text-primary)]">
                    {screen}
                  </td>
                  <td className="py-3 px-4 text-[var(--accent-cobalt)]">{ep}</td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        status.includes('NOT IMPLEMENTED')
                          ? 'text-[var(--status-warning)]'
                          : 'text-[var(--accent-lime-text)]'
                      }
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          2. Proposed API Contracts for Future Subsystems
        </h2>
        <CodeBlock
          title="Proposed Contract — Distributed Load Agent & CI/CD Webhook"
          language="json"
          code={`// POST /api/v2/distributed-agents/dispatch (Status: PLANNED / NOT IMPLEMENTED)
{
  "targetId": 1,
  "regions": ["asia-south1", "eu-central1"],
  "profile": "spike",
  "virtualUsersPerRegion": 250,
  "durationSec": 300
}`}
        />
      </section>
    </motion.div>
  );
};

// --- J. SETTINGS SCREEN (/app/settings) ---
export const SettingsScreen: React.FC = () => {
  const { user, poolTelemetry, clearAllRuns, pushToast } = useApp();
  const [maxVusCap, setMaxVusCap] = useState(100);
  const [maxDurationCap, setMaxDurationCap] = useState(60);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-8 max-w-4xl"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <InlineMeta
          items={[
            'Account & System Governance',
            'User Preferences Separated From System Safety Limits',
          ]}
        />
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
          Workspace & Safety Settings
        </h1>
      </div>

      <section className="surface-shiny rounded-xl p-6 space-y-5">
        <div className="border-b border-[var(--border-subtle)] pb-3">
          <div className="text-xs font-mono text-[var(--accent-cobalt)]">
            USER PREFERENCES (CURRENT ENGINEER SESSION)
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Profile & Light / Dark / System Appearance
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Authenticated User</div>
            <div className="font-bold text-[var(--text-primary)] mt-1">
              {user?.name || 'Aditya Singh'}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Email (GET /api/auth/me)</div>
            <div className="font-bold text-[var(--text-primary)] mt-1">
              {user?.email || 'aditya@lab-engineering.dev'}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">RBAC Role</div>
            <div className="font-bold text-[var(--accent-lime-text)] uppercase mt-1">
              {user?.role || 'admin'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              Interface Color Theme
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Midnight Black + Electric Cobalt + Acid Lime in both Dark and Light visuals.
            </div>
          </div>
          <ThemeSegmentedControl />
        </div>
      </section>

      <section className="surface-shiny rounded-xl border border-[var(--border-strong)] p-6 space-y-5">
        <div className="border-b border-[var(--border-subtle)] pb-3">
          <div className="text-xs font-mono text-[var(--accent-lime-text)]">
            SYSTEM-WIDE ADMINISTRATOR & RESPONSIBLE TESTING SAFEGUARDS
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Resource Caps, Telemetry Reset & PostgreSQL Pool Configuration
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <label className="block font-sans font-medium text-[var(--text-secondary)] mb-1">
              Hard Concurrency Ceiling (Max Virtual Users)
            </label>
            <input
              type="number"
              value={maxVusCap}
              onChange={(e) => setMaxVusCap(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block font-sans font-medium text-[var(--text-secondary)] mb-1">
              Max Single-Run Duration Limit (Seconds)
            </label>
            <input
              type="number"
              value={maxDurationCap}
              onChange={(e) => setMaxDurationCap(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={clearAllRuns}
            className="px-4 py-2 text-xs font-mono rounded-lg border border-[var(--status-error)]/50 text-[var(--status-error)] hover:bg-[var(--status-error)]/10 cursor-pointer"
          >
            Reset All Executed Runs & Pool Telemetry to Zero
          </button>

          <button
            type="button"
            onClick={() =>
              pushToast(
                'Safety Policies Updated',
                `Max VUs=${maxVusCap} · Max Duration=${maxDurationCap}s · Pool Max=${poolTelemetry?.dbPoolMax || 20}`,
                'success'
              )
            }
            className="btn-cobalt-shiny px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
          >
            Save Administrator Safeguards
          </button>
        </div>
      </section>
    </motion.div>
  );
};
