import React, { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  CheckCircle2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ConfirmActionModal,
  EmptyWorkspaceState,
  InlineMeta,
  LatencyPercentileChart,
  TableSkeletonState,
  ThroughputAreaChart,
} from '../../components/ui/Primitives';

// Smooth specular cubic-bezier easing curve for 'shiny' engineering cards
const SHINY_CUBIC_BEZIER: [number, number, number, number] = [0.22, 1, 0.36, 1];

const overviewGridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.065,
      delayChildren: 0.04,
      ease: SHINY_CUBIC_BEZIER,
    },
  },
};

const overviewCardVariants = {
  hidden: {
    opacity: 0,
    y: 22,
    scale: 0.985,
  },
  visible: (customIndex = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.48,
      delay: customIndex * 0.06,
      ease: SHINY_CUBIC_BEZIER,
      layout: {
        duration: 0.4,
        ease: SHINY_CUBIC_BEZIER,
      },
    },
  }),
  exit: {
    opacity: 0,
    y: -14,
    scale: 0.985,
    transition: {
      duration: 0.28,
      ease: SHINY_CUBIC_BEZIER,
    },
  },
};

// --- A. OVERVIEW DASHBOARD (/app/overview) — 100% DYNAMIC ---
export const OverviewDashboardScreen: React.FC = () => {
  const {
    navigate,
    targets,
    issues,
    poolTelemetry,
    loadRuns,
    selectedRunId,
    setSelectedRunId,
    isLoadingData,
    executeLoadRun,
    clearAllRuns,
  } = useApp();

  const [launchingQuick, setLaunchingQuick] = useState(false);

  const activeRun = loadRuns.find((r) => r.id === selectedRunId) || loadRuns[0] || null;
  const totalRequestsAllRuns = loadRuns.reduce((acc, r) => acc + r.metrics.totalRequests, 0);
  const avgRpsAllRuns =
    loadRuns.length > 0
      ? +(loadRuns.reduce((acc, r) => acc + r.metrics.avgRps, 0) / loadRuns.length).toFixed(1)
      : 0;
  const passedRunsCount = loadRuns.filter(
    (r) => r.thresholds.p95Passed && r.thresholds.errorRatePassed
  ).length;

  const handleQuickBenchmark = async (vus: number, mode: 'load' | 'stress') => {
    setLaunchingQuick(true);
    try {
      await executeLoadRun({
        name: `Live ${mode.toUpperCase()} Probe — ${vus} VUs on GET /api/issues`,
        targetId: targets[0]?.id || 1,
        endpointPath: vus > 30 ? '/api/issues?search=auth&page=1&limit=20' : '/api/issues?page=1&limit=20',
        method: 'GET',
        testType: mode,
        virtualUsers: vus,
        durationSec: 10,
        rampUpSec: 3,
        p95LimitMs: 55,
        errorRateLimitPct: 1.0,
      });
      navigate('app-live');
    } finally {
      setLaunchingQuick(false);
    }
  };

  const kpiCards = [
    {
      id: 'kpi-total-runs',
      label: 'Total Runs Executed',
      value: <>{loadRuns.length}</>,
      valueTone: 'text-[var(--text-primary)]',
      subtext:
        loadRuns.length === 0
          ? '0 runs — Run a test to populate'
          : `${passedRunsCount} passed SLO · ${loadRuns.length - passedRunsCount} breached`,
      subtextTone: 'text-[var(--status-success)]',
    },
    {
      id: 'kpi-avg-throughput',
      label: 'Avg Throughput',
      value: (
        <>
          {avgRpsAllRuns} <span className="text-xs font-normal">req/s</span>
        </>
      ),
      valueTone: 'text-[var(--text-primary)]',
      subtext: `${totalRequestsAllRuns.toLocaleString()} measured requests`,
      subtextTone: 'text-[var(--text-muted)]',
    },
    {
      id: 'kpi-latest-latency',
      label: 'Latest p95 / p99',
      value: <>{activeRun ? `${activeRun.metrics.p95Ms}ms` : '0.0ms'}</>,
      valueTone: 'text-[var(--accent-lime-text)]',
      subtext: activeRun
        ? `p50: ${activeRun.metrics.p50Ms}ms · p99: ${activeRun.metrics.p99Ms}ms`
        : 'No latency samples yet',
      subtextTone: 'text-[var(--text-muted)]',
    },
    {
      id: 'kpi-pool-wait',
      label: 'PG Pool Acquire Wait',
      value: <>{poolTelemetry ? `${poolTelemetry.avgWaitMs}ms` : '0.0ms'}</>,
      valueTone: 'text-[var(--text-primary)]',
      subtext: `Max: ${poolTelemetry?.maxWaitMs ?? 0}ms · SQL: ${poolTelemetry?.avgSqlMs ?? 0}ms`,
      subtextTone: 'text-[var(--text-muted)]',
    },
    {
      id: 'kpi-open-issues',
      label: 'Open Bottleneck Issues',
      value: <>{issues.filter((i) => i.status !== 'closed').length}</>,
      valueTone: 'text-[var(--accent-cobalt)]',
      subtext: 'Logged via POST /api/issues',
      subtextTone: 'text-[var(--text-muted)]',
    },
  ];

  return (
    <LayoutGroup id="pulsebench-overview-layout">
      <motion.div
        layout
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: SHINY_CUBIC_BEZIER }}
        className="space-y-6"
      >
        {/* Header */}
        <motion.div
          layout="position"
          transition={{ duration: 0.34, ease: SHINY_CUBIC_BEZIER }}
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]"
        >
          <div>
            <InlineMeta
              items={[
                '100% Dynamic Telemetry Workspace',
                `PostgreSQL Pool Max: ${poolTelemetry?.dbPoolMax || 20}`,
                loadRuns.length === 0
                  ? 'Awaiting First Test Execution'
                  : `${loadRuns.length} Dynamic Runs Recorded`,
              ]}
            />
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
              Performance & Telemetry Overview
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {loadRuns.length > 0 && (
              <button
                type="button"
                onClick={clearAllRuns}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--status-error)] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Stats to Zero</span>
              </button>
            )}

            <button
              type="button"
              disabled={launchingQuick}
              onClick={() => handleQuickBenchmark(20, 'load')}
              className="btn-lime-shiny inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{launchingQuick ? 'Starting...' : 'Quick 10s Live Probe (20 VUs)'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('app-create-test')}
              className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>5-Step Test Wizard</span>
            </button>
          </div>
        </motion.div>

        {isLoadingData && (
          <TableSkeletonState
            rows={4}
            label="Synchronizing live state with Lab_Engineering server..."
          />
        )}

        {!isLoadingData && (
          <>
            {/* 5-Column High-Density Telemetry KPI Strip with Staggered Layout Animations */}
            <motion.div
              layout
              variants={overviewGridVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 font-mono tabular-nums"
            >
              {kpiCards.map((card, idx) => (
                <motion.div
                  key={card.id}
                  layout
                  custom={idx}
                  variants={overviewCardVariants}
                  whileHover={{
                    y: -3,
                    transition: { duration: 0.24, ease: SHINY_CUBIC_BEZIER },
                  }}
                  className="surface-shiny p-4 rounded-xl"
                >
                  <motion.div layout="position" className="text-xs text-[var(--text-muted)]">
                    {card.label}
                  </motion.div>
                  <motion.div
                    layout="position"
                    className={`text-2xl font-bold mt-1 ${card.valueTone}`}
                  >
                    {card.value}
                  </motion.div>
                  <motion.div
                    layout="position"
                    className={`text-[11px] mt-1 ${card.subtextTone}`}
                  >
                    {card.subtext}
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>

            {/* Dynamic Onboarding / Empty State vs Active Telemetry Cards with Layout Transitions */}
            <AnimatePresence mode="popLayout">
              {loadRuns.length === 0 ? (
                <motion.div
                  key="overview-empty-workspace"
                  layout
                  variants={overviewCardVariants}
                  custom={1}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <EmptyWorkspaceState
                    title="Zero Dummy Runs Loaded — Ready for Live Benchmark Execution"
                    description="All metrics above are at 0 because no load test has been executed in this session yet. Launch a 10-second live probe or configure a custom workload in the 5-Step Wizard to stream real-time p50/p95/p99 latency, throughput, and PostgreSQL pool telemetry."
                    actionLabel="Launch 20 VU Live Load Test (10s)"
                    onAction={() => handleQuickBenchmark(20, 'load')}
                    secondaryLabel="Launch 50 VU Pool Stress Test (10s)"
                    onSecondaryAction={() => handleQuickBenchmark(50, 'stress')}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="overview-populated-workspace"
                  layout
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={overviewGridVariants}
                  className="space-y-6"
                >
                  {/* Primary Telemetry Charts Split */}
                  {activeRun && (
                    <motion.div
                      layout
                      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                    >
                      <motion.div
                        key="overview-latency-card"
                        layout
                        custom={0}
                        variants={overviewCardVariants}
                        whileHover={{
                          y: -2,
                          transition: { duration: 0.24, ease: SHINY_CUBIC_BEZIER },
                        }}
                        className="lg:col-span-7 surface-shiny rounded-xl p-5"
                      >
                        <motion.div
                          layout="position"
                          className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[var(--border-subtle)]"
                        >
                          <div>
                            <div className="text-xs font-mono text-[var(--accent-lime-text)]">
                              DYNAMIC LATENCY PERCENTILES ({activeRun.id} · {activeRun.status.toUpperCase()})
                            </div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">
                              {activeRun.name}
                            </h2>
                          </div>
                          <select
                            aria-label="Select run to inspect"
                            value={activeRun.id}
                            onChange={(e) => setSelectedRunId(e.target.value)}
                            className="px-2.5 py-1 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                          >
                            {loadRuns.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.id} — {r.virtualUsers} VUs ({r.testType})
                              </option>
                            ))}
                          </select>
                        </motion.div>
                        <LatencyPercentileChart
                          series={activeRun.series}
                          p95ThresholdMs={activeRun.thresholds.p95LimitMs}
                        />
                      </motion.div>

                      <motion.div
                        key="overview-throughput-card"
                        layout
                        custom={1}
                        variants={overviewCardVariants}
                        whileHover={{
                          y: -2,
                          transition: { duration: 0.24, ease: SHINY_CUBIC_BEZIER },
                        }}
                        className="lg:col-span-5 surface-shiny rounded-xl p-5 flex flex-col justify-between"
                      >
                        <div>
                          <motion.div
                            layout="position"
                            className="pb-3 mb-4 border-b border-[var(--border-subtle)]"
                          >
                            <div className="text-xs font-mono text-[var(--accent-cobalt)]">
                              THROUGHPUT & CONCURRENCY RAMP
                            </div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">
                              Measured Requests / Sec
                            </h2>
                          </motion.div>
                          <ThroughputAreaChart series={activeRun.series} height={195} />
                        </div>

                        <motion.div
                          layout="position"
                          className="pt-3 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono"
                        >
                          <span className="text-[var(--text-muted)]">
                            Elapsed: {activeRun.elapsedSec ?? activeRun.durationSec}s / {activeRun.durationSec}s
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunId(activeRun.id);
                              navigate('app-reports');
                            }}
                            className="text-[var(--accent-cobalt)] hover:underline cursor-pointer"
                          >
                            Inspect Full Run Report &rarr;
                          </button>
                        </motion.div>
                      </motion.div>
                    </motion.div>
                  )}

                  {/* Executed Runs Table Card */}
                  <motion.div
                    key="overview-ledger-card"
                    layout
                    custom={2}
                    variants={overviewCardVariants}
                    className="surface-shiny rounded-xl overflow-hidden"
                  >
                    <motion.div
                      layout="position"
                      className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between"
                    >
                      <h2 className="text-sm font-bold text-[var(--text-primary)]">
                        Executed Benchmark Runs in Session
                      </h2>
                      <button
                        type="button"
                        onClick={() => navigate('app-runs')}
                        className="text-xs font-mono text-[var(--accent-cobalt)] hover:underline cursor-pointer"
                      >
                        Open Full Ledger ({loadRuns.length}) &rarr;
                      </button>
                    </motion.div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                        <thead>
                          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                            <th className="py-2.5 px-4">Run / Endpoint</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">VUs</th>
                            <th className="py-2.5 px-3 text-right">Avg RPS</th>
                            <th className="py-2.5 px-3 text-right">p95</th>
                            <th className="py-2.5 px-3 text-right">Pool Wait</th>
                            <th className="py-2.5 px-4 text-right">SLO Gate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {loadRuns.map((run, rowIdx) => {
                            const passed = run.thresholds.p95Passed && run.thresholds.errorRatePassed;
                            return (
                              <motion.tr
                                key={run.id}
                                layout
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.36,
                                  delay: rowIdx * 0.04,
                                  ease: SHINY_CUBIC_BEZIER,
                                  layout: { duration: 0.32, ease: SHINY_CUBIC_BEZIER },
                                }}
                                onClick={() => {
                                  setSelectedRunId(run.id);
                                  navigate(run.status === 'running' ? 'app-live' : 'app-reports');
                                }}
                                className="hover:bg-[var(--bg-elevated)]/60 cursor-pointer"
                              >
                                <td className="py-3 px-4">
                                  <div className="font-sans font-semibold text-[var(--text-primary)]">
                                    {run.name}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-muted)]">
                                    {run.id} · {run.targetKey} · {run.method} {run.endpointPath}
                                  </div>
                                </td>
                                <td className="py-3 px-3 uppercase font-bold text-[var(--accent-cobalt)]">
                                  {run.status === 'running'
                                    ? `RUNNING (${run.elapsedSec}/${run.durationSec}s)`
                                    : run.status}
                                </td>
                                <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                                  {run.virtualUsers}
                                </td>
                                <td className="py-3 px-3 text-right text-[var(--text-primary)]">
                                  {run.metrics.avgRps}
                                </td>
                                <td className="py-3 px-3 text-right text-[var(--accent-lime-text)]">
                                  {run.metrics.p95Ms}ms
                                </td>
                                <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                                  {run.metrics.poolWaitAvgMs}ms
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span
                                    className={
                                      passed
                                        ? 'text-[var(--status-success)]'
                                        : 'text-[var(--status-error)]'
                                    }
                                  >
                                    {passed ? 'PASS' : 'BREACH'}
                                  </span>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </LayoutGroup>
  );
};

// --- B. SERVERS & TARGETS (/app/targets) ---
export const TargetsScreen: React.FC = () => {
  const { targets, createTarget, deleteTarget, verifyTarget, navigate } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [healthEndpoint, setHealthEndpoint] = useState('/api/health');
  const [environment, setEnvironment] = useState<'local' | 'staging' | 'production' | 'lab'>(
    'staging'
  );
  const [description, setDescription] = useState('');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'header'>('bearer');
  const [secretInput, setSecretInput] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!ownershipConfirmed) {
      setFormError(
        'You must confirm ownership or explicit written testing authorization for this target.'
      );
      return;
    }
    if (!/^[A-Za-z0-9]{2,10}$/.test(key.trim())) {
      setFormError(
        'Target key must be 2–10 alphanumeric characters (enforced by project.validator.js).'
      );
      return;
    }
    setSubmitting(true);
    try {
      const redactedHint =
        authType !== 'none' && secretInput.trim().length > 4
          ? `${authType === 'bearer' ? 'Bearer ' : 'Header '}***${secretInput.trim().slice(-4)}`
          : undefined;
      await createTarget({
        name,
        key,
        description,
        baseUrl,
        environment,
        healthEndpoint,
        authType,
        redactedSecretHint: redactedHint,
      });
      setShowAddForm(false);
      setName('');
      setKey('');
      setDescription('');
      setSecretInput('');
      setOwnershipConfirmed(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to register target');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (tId: number, url: string, ep: string) => {
    setVerifyingId(tId);
    try {
      await verifyTarget(tId, url, ep);
    } catch {
      // handled by toast
    } finally {
      setVerifyingId(null);
    }
  };

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
              'Authorized Target Registry',
              'Persisted via project/ (/api/projects)',
              'SSRF & Secret Redaction Enabled',
            ]}
          />
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            Servers & Authorized Testing Targets
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{showAddForm ? 'Close Target Form' : 'Add Authorized Target'}</span>
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="surface-shiny rounded-xl p-6 space-y-5 border border-[var(--border-strong)]"
        >
          <div className="border-b border-[var(--border-subtle)] pb-3">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Register New Server Target (<code className="font-mono text-xs">POST /api/projects</code>)
            </h2>
          </div>

          {formError && (
            <div className="p-3 rounded-lg border border-[var(--status-error)]/40 bg-[var(--bg-elevated)] text-xs font-mono text-[var(--status-error)]">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Target Name *
              </label>
              <input
                type="text"
                required
                minLength={2}
                placeholder="e.g. Order Checkout API"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Project Key (2–10 Alphanumeric) *
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={10}
                placeholder="ORDERAPI"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Environment Label
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              >
                <option value="local">local (Loopback)</option>
                <option value="lab">lab (Sandbox)</option>
                <option value="staging">staging (Pre-Prod)</option>
                <option value="production">production (Guarded)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Base URL *
              </label>
              <input
                type="url"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Health Verification Path *
              </label>
              <input
                type="text"
                required
                value={healthEndpoint}
                onChange={(e) => setHealthEndpoint(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={ownershipConfirmed}
              onChange={(e) => setOwnershipConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm that I own this target server or hold explicit authorization to execute HTTP performance probes against{' '}
              <code className="font-mono">{baseUrl}</code>.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-cobalt-shiny px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
            >
              {submitting ? 'Registering...' : 'Save & Verify Target'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4">
        {targets.map((t) => {
          const cfg = t.targetConfig;
          return (
            <div
              key={t.id}
              className="surface-shiny rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">{t.name}</h2>
                  <span className="text-xs font-mono text-[var(--accent-cobalt)]">[{t.key}]</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] max-w-2xl">{t.description}</p>
                <InlineMeta
                  items={[
                    `Base URL: ${cfg?.baseUrl || 'http://localhost:3000'}`,
                    `Env: ${cfg?.environment || 'local'}`,
                    cfg?.lastLatencyMs !== null && cfg?.lastLatencyMs !== undefined
                      ? `Measured Probe Latency: ${cfg.lastLatencyMs}ms (${cfg.lastHealthStatus})`
                      : 'Probe Latency: Click Verify Health to measure live',
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={verifyingId === t.id}
                  onClick={() =>
                    handleVerify(
                      t.id,
                      cfg?.baseUrl || 'http://localhost:3000',
                      cfg?.healthEndpoint || '/api/health'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-lime-text)] hover:border-[var(--accent-lime)] cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${verifyingId === t.id ? 'animate-spin' : ''}`}
                  />
                  <span>{verifyingId === t.id ? 'Probing...' : 'Verify Health Live'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('app-create-test')}
                  className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Configure Test</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteCandidateId(t.id)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--status-error)] rounded-lg border border-[var(--border-subtle)] cursor-pointer"
                  aria-label={`Delete target ${t.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmActionModal
        open={deleteCandidateId !== null}
        title="Remove Authorized Server Target?"
        description="Deleting this target sends DELETE /api/projects/:id to the Lab_Engineering backend."
        confirmLabel="Delete Target"
        tone="danger"
        onCancel={() => setDeleteCandidateId(null)}
        onConfirm={async () => {
          if (deleteCandidateId !== null) {
            await deleteTarget(deleteCandidateId);
            setDeleteCandidateId(null);
          }
        }}
      />
    </motion.div>
  );
};

// --- C. CREATE TEST 5-STEP WIZARD (/app/create-test) ---
export const CreateTestWizardScreen: React.FC = () => {
  const { targets, executeLoadRun, navigate } = useApp();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [targetId, setTargetId] = useState<number>(targets[0]?.id || 1);
  const [testType, setTestType] = useState<'load' | 'stress'>('load');
  const [runName, setRunName] = useState('GET /api/issues Paginated Benchmark — 25 VUs');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [endpointPath, setEndpointPath] = useState('/api/issues?page=1&limit=20');
  const [virtualUsers, setVirtualUsers] = useState(25);
  const [durationSec, setDurationSec] = useState(12);
  const [rampUpSec, setRampUpSec] = useState(3);
  const [pacingMs, setPacingMs] = useState(100);
  const [p95LimitMs, setP95LimitMs] = useState(55);
  const [errorRateLimitPct, setErrorRateLimitPct] = useState(1.0);
  const [safetyAuthorized, setSafetyAuthorized] = useState(false);
  const [safetyLimitsAccepted, setSafetyLimitsAccepted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const selectedTarget = targets.find((t) => t.id === Number(targetId)) || targets[0];
  const estimatedRequests = Math.round(
    virtualUsers * (1000 / Math.max(50, pacingMs)) * durationSec * 0.65
  );

  const handleNextStep = () => {
    setValidationError(null);
    if (step === 3) {
      if (virtualUsers < 1 || virtualUsers > 100) {
        setValidationError(
          'Safety Cap: Virtual Users must be between 1 and 100 for single-node runs.'
        );
        return;
      }
      if (durationSec < 5 || durationSec > 60) {
        setValidationError('Safety Cap: Duration must be between 5 and 60 seconds.');
        return;
      }
      if (!endpointPath.startsWith('/')) {
        setValidationError('Endpoint path must begin with a leading slash (e.g. /api/issues).');
        return;
      }
    }
    if (step === 4) {
      if (!safetyAuthorized || !safetyLimitsAccepted) {
        setValidationError(
          'Explicit safety and authorization confirmation is required before advancing to launch.'
        );
        return;
      }
    }
    if (step < 5) setStep((s) => (s + 1) as any);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    setValidationError(null);
    try {
      await executeLoadRun({
        name: runName,
        targetId: selectedTarget?.id || 1,
        endpointPath,
        method,
        testType,
        virtualUsers,
        durationSec,
        rampUpSec,
        p95LimitMs,
        errorRateLimitPct,
      });
      navigate('app-live');
    } catch (err: any) {
      setValidationError(err?.message || 'Benchmark execution failed');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6 max-w-4xl"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <InlineMeta
          items={[
            'Step-by-Step Load Configuration Wizard',
            'Real-Time Server Probe Runner (POST /api/load-runs/execute)',
          ]}
        />
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
          Configure & Launch Dynamic Performance Test
        </h1>
      </div>

      {/* 5-Step Progress Bar */}
      <div className="grid grid-cols-5 gap-2 font-mono text-xs">
        {[
          [1, '1. Target'],
          [2, '2. Test Type'],
          [3, '3. Workload'],
          [4, '4. Safety Review'],
          [5, '5. Launch'],
        ].map(([num, label]) => {
          const active = step === num;
          const done = step > (num as number);
          return (
            <button
              key={num}
              type="button"
              onClick={() => {
                if ((num as number) < step) setStep(num as any);
              }}
              className={`py-2.5 px-3 rounded-lg border text-left transition-colors cursor-pointer ${
                active
                  ? 'border-[#3B82F6] bg-[var(--accent-cobalt-soft)] text-[var(--text-primary)] font-bold'
                  : done
                  ? 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--accent-lime-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {validationError && (
        <div className="p-3.5 rounded-lg border border-[var(--status-error)]/50 bg-[var(--bg-surface)] text-xs font-mono text-[var(--status-error)]">
          {validationError}
        </div>
      )}

      <div className="surface-shiny rounded-2xl p-6 space-y-6 border border-[var(--border-strong)]">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Step 1: Select Authorized Target Server
            </h2>
            <div className="space-y-3">
              {targets.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-start justify-between p-4 rounded-xl border cursor-pointer ${
                    Number(targetId) === t.id
                      ? 'border-[#3B82F6] bg-[var(--accent-cobalt-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="targetId"
                      checked={Number(targetId) === t.id}
                      onChange={() => setTargetId(t.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {t.name}{' '}
                        <span className="font-mono text-xs text-[var(--accent-cobalt)]">
                          [{t.key}]
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {t.description}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                        Base URL: {t.targetConfig?.baseUrl || 'http://localhost:3000'} · Env:{' '}
                        {t.targetConfig?.environment || 'local'}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Step 2: Choose Performance Test Profile
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setTestType('load');
                  setVirtualUsers(20);
                  setRunName('GET /api/issues Paginated Load — 20 VUs');
                }}
                className={`p-4 rounded-xl border text-left cursor-pointer ${
                  testType === 'load'
                    ? 'border-[#3B82F6] bg-[var(--accent-cobalt-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="text-xs font-mono text-[var(--status-success)] mb-1">
                  IMPLEMENTED · CONTROLLED LOAD
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Standard Load Test
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Evaluate p50/p95/p99 latency and throughput under expected concurrent traffic (1–30 VUs).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTestType('stress');
                  setVirtualUsers(50);
                  setEndpointPath('/api/issues?search=auth&page=1&limit=20');
                  setRunName('GET /api/issues?search=auth Pool Stress — 50 VUs');
                }}
                className={`p-4 rounded-xl border text-left cursor-pointer ${
                  testType === 'stress'
                    ? 'border-[#3B82F6] bg-[var(--accent-cobalt-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="text-xs font-mono text-[var(--accent-lime-text)] mb-1">
                  IMPLEMENTED · POOL SATURATION STRESS
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Connection Pool Stress Test
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Push concurrency above <code className="font-mono">DB_POOL_MAX=20</code> (35–100 VUs) to measure pool wait queuing.
                </p>
              </button>

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] opacity-65">
                <div className="text-xs font-mono text-[var(--status-warning)] mb-1">
                  PLANNED · MULTI-AGENT SPIKE
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Distributed Spike Test (Planned)
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Requires Phase 3 distributed agent worker queue.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] opacity-65">
                <div className="text-xs font-mono text-[var(--status-warning)] mb-1">
                  PLANNED · LONG-DURATION SOAK
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Multi-Hour Endurance Soak (Planned)
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Continuous 4–24 hour endurance testing via external worker daemon.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Step 3: Configure Workload & SLO Thresholds
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Test Run Label
                </label>
                <input
                  type="text"
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Endpoint Path
                  </label>
                  <input
                    type="text"
                    value={endpointPath}
                    onChange={(e) => setEndpointPath(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
              <div>
                <label className="block text-xs font-sans font-medium text-[var(--text-secondary)] mb-1">
                  Virtual Users (1–100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={virtualUsers}
                  onChange={(e) => setVirtualUsers(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-sans font-medium text-[var(--text-secondary)] mb-1">
                  Duration (5–60s)
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-sans font-medium text-[var(--text-secondary)] mb-1">
                  Ramp-Up (sec)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={rampUpSec}
                  onChange={(e) => setRampUpSec(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-sans font-medium text-[var(--text-secondary)] mb-1">
                  Pass Gate p95 &le; (ms)
                </label>
                <input
                  type="number"
                  value={p95LimitMs}
                  onChange={(e) => setP95LimitMs(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Step 4: Safety & Responsible Testing Review
            </h2>
            <div className="p-4 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--bg-elevated)] space-y-2 text-xs">
              <div className="font-mono font-semibold text-[var(--status-warning)]">
                TRAFFIC & DATABASE POOL IMPACT ESTIMATE
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                This configuration will stream live HTTP probes over{' '}
                <strong className="font-mono">{durationSec}s</strong> (~{estimatedRequests.toLocaleString()} estimated requests) with peak concurrency of{' '}
                <strong className="font-mono">{virtualUsers} VUs</strong> against{' '}
                <code className="font-mono">
                  {selectedTarget?.targetConfig?.baseUrl}
                  {endpointPath}
                </code>
                .
              </p>
            </div>

            <div className="space-y-3 pt-2 text-xs text-[var(--text-secondary)]">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safetyAuthorized}
                  onChange={(e) => setSafetyAuthorized(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm that I am authorized to test{' '}
                  <strong className="text-[var(--text-primary)]">{selectedTarget?.name}</strong>.
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safetyLimitsAccepted}
                  onChange={(e) => setSafetyLimitsAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I understand that SSRF guards, rate limits, and real-time Emergency Stop controls are active.
                </span>
              </label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Step 5: Final Configuration Snapshot & Launch
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">Target</div>
                <div className="font-bold text-[var(--text-primary)]">{selectedTarget?.name}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">Endpoint</div>
                <div className="font-bold text-[var(--text-primary)]">
                  {method} {endpointPath}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">Profile</div>
                <div className="font-bold text-[var(--accent-lime-text)] uppercase">
                  {testType} · {virtualUsers} VUs · {durationSec}s
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1) as any)}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] disabled:opacity-40 cursor-pointer"
          >
            &larr; Previous Step
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="btn-cobalt-shiny px-5 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
            >
              Continue to Step {step + 1} &rarr;
            </button>
          ) : (
            <button
              type="button"
              disabled={launching}
              onClick={handleLaunch}
              className="btn-lime-shiny inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {launching ? 'Starting Live Stream...' : 'Launch Real-Time Benchmark Run'}
              </span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- D. LIVE TEST MONITORING (/app/live) — REAL-TIME SERVER STREAM ---
export const LiveMonitoringScreen: React.FC = () => {
  const {
    loadRuns,
    selectedRunId,
    setSelectedRunId,
    poolTelemetry,
    executeLoadRun,
    stopLoadRun,
    navigate,
  } = useApp();

  const activeRun = loadRuns.find((r) => r.id === selectedRunId) || loadRuns[0] || null;

  if (!activeRun) {
    return (
      <EmptyWorkspaceState
        title="No Active or Completed Test Run in Session"
        description="Launch a real server-side benchmark run to watch live second-by-second p50/p95/p99 latency curves, throughput (req/s), HTTP status codes, and PostgreSQL connection pool wait times stream in real time."
        actionLabel="Start 10s Live Benchmark Now (25 VUs)"
        onAction={async () => {
          await executeLoadRun({
            name: 'Live Monitor Benchmark — 25 VUs on GET /api/issues',
            targetId: 1,
            endpointPath: '/api/issues?page=1&limit=20',
            method: 'GET',
            testType: 'load',
            virtualUsers: 25,
            durationSec: 10,
            rampUpSec: 3,
            p95LimitMs: 55,
            errorRateLimitPct: 1.0,
          });
        }}
        secondaryLabel="Open 5-Step Wizard"
        onSecondaryAction={() => navigate('app-create-test')}
      />
    );
  }

  const elapsed = activeRun.elapsedSec ?? activeRun.durationSec;
  const pctProgress = Math.min(100, Math.round((elapsed / Math.max(1, activeRun.durationSec)) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <InlineMeta
            items={[
              `Run ID: ${activeRun.id}`,
              `Target: ${activeRun.targetName} (${activeRun.targetKey})`,
              `Status: ${activeRun.status.toUpperCase()} (${elapsed}s / ${activeRun.durationSec}s)`,
            ]}
          />
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            Live Telemetry & Resource Stream
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {loadRuns.length > 1 && (
            <select
              value={activeRun.id}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
            >
              {loadRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.name} ({r.status})
                </option>
              ))}
            </select>
          )}

          {activeRun.status === 'running' ? (
            <button
              type="button"
              onClick={() => stopLoadRun(activeRun.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Emergency Stop Run</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                executeLoadRun({
                  name: `${activeRun.method} ${activeRun.endpointPath} — ${activeRun.virtualUsers} VUs Re-Run`,
                  targetId: activeRun.targetId,
                  endpointPath: activeRun.endpointPath,
                  method: activeRun.method,
                  testType: activeRun.testType === 'stress' ? 'stress' : 'load',
                  virtualUsers: activeRun.virtualUsers,
                  durationSec: activeRun.durationSec,
                  rampUpSec: activeRun.rampUpSec,
                  p95LimitMs: activeRun.thresholds.p95LimitMs,
                  errorRateLimitPct: activeRun.thresholds.errorRateLimitPct,
                })
              }
              className="btn-cobalt-shiny inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Re-Run Live Probe</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Progress Bar */}
      <div className="surface-shiny rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
          <span className="text-[var(--accent-lime-text)] font-bold uppercase">
            {activeRun.status === 'running'
              ? `LIVE SERVER STREAM IN PROGRESS — TICK ${elapsed}s OF ${activeRun.durationSec}s`
              : `RUN ${activeRun.status.toUpperCase()} — ${elapsed}s EXECUTED`}
          </span>
          <span className="text-[var(--text-primary)] font-bold">{pctProgress}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden border border-[var(--border-subtle)]">
          <div
            className="h-full bg-gradient-to-r from-[#2563EB] to-[#BEF264] transition-all duration-500"
            style={{ width: `${pctProgress}%` }}
          />
        </div>
      </div>

      {/* Primary Real-Time Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">Status / Elapsed</div>
          <div className="text-base font-bold text-[var(--accent-lime-text)] uppercase mt-1">
            {activeRun.status}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            {elapsed}s / {activeRun.durationSec}s
          </div>
        </div>

        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">Active VUs</div>
          <div className="text-xl font-bold text-[var(--text-primary)] mt-1">
            {activeRun.series[activeRun.series.length - 1]?.vus ?? activeRun.virtualUsers}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Target: {activeRun.virtualUsers} VUs
          </div>
        </div>

        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">Throughput (RPS)</div>
          <div className="text-xl font-bold text-[var(--text-primary)] mt-1">
            {activeRun.metrics.avgRps}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Peak: {activeRun.metrics.peakRps} req/s
          </div>
        </div>

        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">p50 / p95 / p99</div>
          <div className="text-base font-bold text-[var(--text-primary)] mt-1">
            {activeRun.metrics.p50Ms} / {activeRun.metrics.p95Ms} / {activeRun.metrics.p99Ms}ms
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Min {activeRun.metrics.minMs}ms · Max {activeRun.metrics.maxMs}ms
          </div>
        </div>

        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">2xx vs Failed</div>
          <div className="text-base font-bold text-[var(--status-success)] mt-1">
            {activeRun.metrics.successfulRequests.toLocaleString()} OK
          </div>
          <div className="text-[11px] text-[var(--status-error)] mt-0.5">
            {activeRun.metrics.failedRequests} failed ({activeRun.metrics.errorRatePct}%)
          </div>
        </div>

        <div className="surface-shiny p-3.5 rounded-xl">
          <div className="text-[11px] text-[var(--text-muted)]">PG Pool Wait / SQL</div>
          <div className="text-base font-bold text-[var(--text-primary)] mt-1">
            {activeRun.metrics.poolWaitAvgMs}ms / {activeRun.metrics.sqlExecAvgMs}ms
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Pool Max: {poolTelemetry?.dbPoolMax || 20}
          </div>
        </div>
      </div>

      {/* Charts Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-shiny rounded-xl p-5">
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">
            Real-Time Latency Percentiles (p50, p95, p99)
          </h2>
          <LatencyPercentileChart
            series={activeRun.series}
            p95ThresholdMs={activeRun.thresholds.p95LimitMs}
          />
        </div>

        <div className="surface-shiny rounded-xl p-5">
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">
            Throughput (Requests/Sec) Stream
          </h2>
          <ThroughputAreaChart series={activeRun.series} />
        </div>
      </div>

      {/* Status Codes + Target Resource Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 surface-shiny rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            HTTP Status-Code Breakdown & Live Tick Log
          </h2>
          <div className="grid grid-cols-3 gap-3 font-mono text-xs tabular-nums">
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[var(--status-success)] font-bold">HTTP 200 OK</div>
              <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                {(activeRun.metrics.statusCodes['200'] || 0).toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[var(--status-warning)] font-bold">HTTP 429 Rate Limit</div>
              <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                {(activeRun.metrics.statusCodes['429'] || 0).toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[var(--status-error)] font-bold">HTTP 500 Fault</div>
              <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                {(activeRun.metrics.statusCodes['500'] || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 surface-shiny rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Target Resource Telemetry (Measured vs Unavailable)
            </h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Zero vs N/A Strictly Distinguished
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono tabular-nums">
            <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[var(--text-muted)]">PostgreSQL Pool Connections</div>
              <div className="text-sm font-bold text-[var(--text-primary)] mt-1">
                {poolTelemetry?.activeConnections ?? 0} active / {poolTelemetry?.dbPoolMax ?? 20} max
              </div>
              <div className="text-[11px] text-[var(--status-success)] mt-0.5">
                Measured via project/ src/config/db.js
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[var(--text-muted)]">Host Kernel CPU Steal / Disk IOPS</div>
              <div className="text-sm font-bold text-[var(--text-muted)] mt-1">
                UNAVAILABLE (N/A)
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Requires optional node_exporter daemon on target host
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
