import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Play,
  Search,
  Terminal,
  Zap,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CodeBlock,
  InlineMeta,
  LatencyPercentileChart,
  ThemeSegmentedControl,
  ThroughputAreaChart,
} from '../../components/ui/Primitives';
import { RouteId } from '../../types';

// --- Public Top Bar (Strict 3-Zone Contract) ---
export const PublicHeader: React.FC = () => {
  const { route, navigate } = useApp();

  return (
    <div className="sticky top-0 z-40 bg-[var(--bg-canvas)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
      <header className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Brand Title (Single text element, one line) */}
        <button
          type="button"
          onClick={() => navigate('home')}
          className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] font-display whitespace-nowrap shrink-0 cursor-pointer"
        >
          PulseBench
        </button>

        {/* Zone 2: 5 Concise Single-Line Nav Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--text-secondary)]"
        >
          <button
            type="button"
            onClick={() => navigate('product')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'product'
                ? 'text-[var(--text-primary)] underline underline-offset-8 decoration-[#3B82F6]'
                : ''
            }`}
          >
            Product
          </button>
          <button
            type="button"
            onClick={() => navigate('docs')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'docs'
                ? 'text-[var(--text-primary)] underline underline-offset-8 decoration-[#3B82F6]'
                : ''
            }`}
          >
            Documentation
          </button>
          <button
            type="button"
            onClick={() => navigate('community')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'community'
                ? 'text-[var(--text-primary)] underline underline-offset-8 decoration-[#3B82F6]'
                : ''
            }`}
          >
            Community
          </button>
          <a
            href="https://github.com/adityasinghr651/Lab_Engineering/tree/main/project"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={() => navigate('auth-signin')}
            className={`hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route.startsWith('auth-')
                ? 'text-[var(--text-primary)] underline underline-offset-8 decoration-[#3B82F6]'
                : ''
            }`}
          >
            Sign In
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('app-overview')}
            className="btn-cobalt-shiny px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start Testing
          </button>
        </div>
      </header>
    </div>
  );
};

// --- Public Footer with Theme System & Full Route Access ---
export const PublicFooter: React.FC = () => {
  const { navigate } = useApp();

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] mt-20">
      <div className="max-w-[1360px] mx-auto px-6 py-12">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-10 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-base font-bold text-[var(--text-primary)] font-display mb-1">
              PulseBench — Open-Source Server Performance Engineering
            </div>
            <p className="text-xs text-[var(--text-muted)] max-w-xl">
              Built on the <code className="font-mono">adityasinghr651/Lab_Engineering</code> (
              <code className="font-mono">project/</code>) Express + PostgreSQL architecture. 100% dynamic execution with zero static dummy benchmarks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs text-[var(--text-muted)] font-mono">Appearance:</span>
            <ThemeSegmentedControl />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 py-10 text-xs">
          <div className="space-y-2.5">
            <div className="font-semibold text-[var(--text-primary)]">Platform</div>
            <ul className="space-y-2 text-[var(--text-secondary)]">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('home')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Home & Interactive Demo Guide
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('product')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Architecture & Repo Audit
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('app-overview')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Engineering Console
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('app-create-test')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Load Test Wizard
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-semibold text-[var(--text-primary)]">Documentation & Open Source</div>
            <ul className="space-y-2 text-[var(--text-secondary)]">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('docs')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Quick Start & Metrics Guide
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('community')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Community & Roadmap
                </button>
              </li>
              <li>
                <a
                  href="https://github.com/adityasinghr651/Lab_Engineering/tree/main/project"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--text-primary)] inline-flex items-center gap-1"
                >
                  <span>GitHub (project/)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('app-integrations')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  API Contract Map
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-semibold text-[var(--text-primary)]">Authentication Flows</div>
            <ul className="space-y-2 text-[var(--text-secondary)]">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('auth-signin')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Sign In (POST /auth/login)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('auth-signup')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Sign Up (POST /auth/register)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('auth-forgot')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Forgot / Reset Password
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('auth-expired')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Session Expired / Auth Error
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-semibold text-[var(--text-primary)]">Legal, Security & System States</div>
            <ul className="space-y-2 text-[var(--text-secondary)]">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('legal-security')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Responsible Testing & SSRF Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('legal-privacy')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Privacy & Terms of Service
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('legal-accessibility')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Accessibility Statement
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('status-404')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  System Pages (404 / 403 / 500 / Maint)
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <span>
            ISC License · Open-Source Server Performance Engineering Platform · Repository: adityasinghr651/Lab_Engineering
          </span>
          <span>100% Dynamic Telemetry · Midnight Black + Electric Cobalt + Acid Lime</span>
        </div>
      </div>
    </footer>
  );
};

// --- 1. HOME PAGE WITH INTERACTIVE DEMO INSTRUCTIONS & LIVE SANDBOX ---
export const HomePage: React.FC = () => {
  const { navigate, loadRuns, executeLoadRun, poolTelemetry, setDevToolsOpen } = useApp();
  const [demoVus, setDemoVus] = useState<number>(25);
  const [demoDuration, setDemoDuration] = useState<number>(8);
  const [demoEndpoint, setDemoEndpoint] = useState<string>('/api/issues?page=1&limit=20');
  const [isTriggeringDemo, setIsTriggeringDemo] = useState<boolean>(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const latestLiveRun = loadRuns[0] || null;

  const handleRunLiveDemoOnHome = async () => {
    setIsTriggeringDemo(true);
    try {
      await executeLoadRun({
        name: `Home Demo Probe — ${demoVus} VUs on ${demoEndpoint}`,
        targetId: 1,
        endpointPath: demoEndpoint,
        method: 'GET',
        testType: demoVus > 30 ? 'stress' : 'load',
        virtualUsers: demoVus,
        durationSec: demoDuration,
        rampUpSec: 2,
        p95LimitMs: 55,
        errorRateLimitPct: 1.0,
      });
    } finally {
      setIsTriggeringDemo(false);
    }
  };

  const faqs = [
    {
      q: 'Why do dashboard statistics start at zero before I run a test?',
      a: 'PulseBench never displays fabricated or static dummy benchmark runs in your workspace. All throughput counters, p50/p95/p99 latency curves, PostgreSQL pool wait times (WaitMs vs SqlMs), and bottleneck analysis cards are generated dynamically in real time when you execute a test.',
    },
    {
      q: 'How does the Interactive Demo on this Home Page work?',
      a: 'Clicking "Run Live Server Probe" in the Home Page Demo Sandbox dispatches an actual server-side benchmark against the Lab_Engineering Express API (/api/issues or /api/health), streaming real second-by-second telemetry ticks back to the chart and populating your workspace.',
    },
    {
      q: 'What is the Developer Tools Inspector in the bottom-left corner?',
      a: 'The built-in DevTools Inspector shows every live HTTP wire request (method, endpoint, status code, response time in ms) and live PostgreSQL connection pool state (DB_POOL_MAX=20, active/idle connections, WaitMs, SqlMs) as requests occur in the background.',
    },
    {
      q: 'How does PulseBench protect targets from accidental overload?',
      a: 'Every test run enforces hard caps on virtual users (max 100 VUs), duration (max 60s), SSRF private-network filtering, and an immediate Emergency Stop button that aborts the server probe loop.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />

      {/* Developer Tools & Theme Utility Bar */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur">
        <div className="max-w-[1360px] mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs">
          <InlineMeta
            items={[
              'Dynamic Engine: Zero Static Dummy Runs',
              `Live PG Pool Ops: ${poolTelemetry?.count ?? 0}`,
              `Executed Runs in Session: ${loadRuns.length}`,
            ]}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDevToolsOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-mono text-[var(--accent-lime-text)] hover:border-[var(--accent-lime)] cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Toggle Background DevTools</span>
            </button>
            <ThemeSegmentedControl compact />
          </div>
        </div>
      </div>

      <main className="flex-1">
        {/* HERO + LIVE INTERACTIVE DEMO SANDBOX */}
        <section className="max-w-[1360px] mx-auto px-6 pt-12 pb-16 border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="lg:col-span-6 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-5">
                <InlineMeta
                  items={[
                    'Open-Source Performance Engineering',
                    '100% Real-Time Dynamic Telemetry',
                  ]}
                />
                <h1
                  className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.08]"
                  style={{ textWrap: 'balance' }}
                >
                  Run real server load tests and watch live telemetry unfold tick by tick.
                </h1>
                <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-xl">
                  Built on the <code className="font-mono text-xs">adityasinghr651/Lab_Engineering</code>{' '}
                  (<code className="font-mono text-xs">project/</code>) backend. Nothing is pre-faked: launch a controlled probe from the{' '}
                  <strong className="text-[var(--text-primary)]">Home Demo Sandbox</strong> or the{' '}
                  <strong className="text-[var(--text-primary)]">5-Step Test Wizard</strong> to populate live{' '}
                  <code className="font-mono text-xs text-[var(--accent-lime-text)]">p50 / p95 / p99</code>{' '}
                  latencies, throughput, and PostgreSQL pool metrics.
                </p>
              </div>

              <div className="space-y-5 pt-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('app-create-test')}
                    className="btn-cobalt-shiny inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Launch Test Wizard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('app-overview')}
                    className="btn-lime-shiny inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Activity className="w-4 h-4" />
                    <span>Open Engineering Console</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('docs')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Read Docs</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)] grid grid-cols-3 gap-4 font-mono tabular-nums">
                  <div className="surface-shiny p-3 rounded-lg">
                    <div className="text-[11px] text-[var(--text-muted)]">Active Runs</div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {loadRuns.length} Runs
                    </div>
                  </div>
                  <div className="surface-shiny p-3 rounded-lg">
                    <div className="text-[11px] text-[var(--text-muted)]">PG Pool Wait</div>
                    <div className="text-lg font-bold text-[var(--accent-lime-text)]">
                      {poolTelemetry?.avgWaitMs ?? 0} ms
                    </div>
                  </div>
                  <div className="surface-shiny p-3 rounded-lg">
                    <div className="text-[11px] text-[var(--text-muted)]">Latest p95</div>
                    <div className="text-lg font-bold text-[var(--accent-cobalt)]">
                      {latestLiveRun ? `${latestLiveRun.metrics.p95Ms} ms` : 'Run a Test'}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* HOME PAGE INTERACTIVE DEMO SANDBOX */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.05 }}
              className="lg:col-span-6 flex"
            >
              <div className="surface-shiny w-full rounded-2xl p-6 flex flex-col justify-between border border-[var(--border-strong)]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                    <div>
                      <div className="text-xs font-mono font-bold text-[var(--accent-lime-text)]">
                        HOME PAGE INTERACTIVE DEMO SANDBOX
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Configure & trigger a real server-side probe right here to watch live stats populate
                      </div>
                    </div>
                    {latestLiveRun?.status === 'running' && (
                      <span className="text-xs font-mono font-bold text-[var(--accent-cobalt)]">
                        STREAMING {latestLiveRun.elapsedSec}/{latestLiveRun.durationSec}s
                      </span>
                    )}
                  </div>

                  {/* Interactive Demo Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Target Endpoint
                      </label>
                      <select
                        value={demoEndpoint}
                        onChange={(e) => setDemoEndpoint(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      >
                        <option value="/api/issues?page=1&limit=20">GET /api/issues (Paginated)</option>
                        <option value="/api/issues?search=auth">GET /api/issues?search=auth</option>
                        <option value="/api/health">GET /api/health (Liveness)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Concurrency (VUs)
                      </label>
                      <select
                        value={demoVus}
                        onChange={(e) => setDemoVus(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      >
                        <option value={15}>15 VUs (Nominal Load)</option>
                        <option value={25}>25 VUs (Moderate Load)</option>
                        <option value={50}>50 VUs (Pool Stress &gt; 20)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Duration
                      </label>
                      <select
                        value={demoDuration}
                        onChange={(e) => setDemoDuration(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      >
                        <option value={6}>6 Seconds (Fast)</option>
                        <option value={10}>10 Seconds (Standard)</option>
                        <option value={15}>15 Seconds (Extended)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={isTriggeringDemo || latestLiveRun?.status === 'running'}
                      onClick={handleRunLiveDemoOnHome}
                      className="btn-cobalt-shiny inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>
                        {latestLiveRun?.status === 'running'
                          ? `Running Live Probe (${latestLiveRun.elapsedSec}/${latestLiveRun.durationSec}s)...`
                          : 'Run Live Server Probe Now'}
                      </span>
                    </button>

                    {latestLiveRun && (
                      <button
                        type="button"
                        onClick={() => navigate('app-live')}
                        className="px-3.5 py-2 text-xs font-mono rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-lime-text)] hover:border-[var(--accent-lime)] cursor-pointer"
                      >
                        Inspect in Live Monitor &rarr;
                      </button>
                    )}
                  </div>

                  {/* Dynamic Telemetry Result Area */}
                  {latestLiveRun ? (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums">
                        <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Live RPS</div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">
                            {latestLiveRun.metrics.avgRps} req/s
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="text-[10px] text-[var(--text-muted)]">p95 Latency</div>
                          <div className="text-sm font-bold text-[var(--accent-lime-text)]">
                            {latestLiveRun.metrics.p95Ms} ms
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="text-[10px] text-[var(--text-muted)]">PG Pool Wait</div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">
                            {latestLiveRun.metrics.poolWaitAvgMs} ms
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Total Requests</div>
                          <div className="text-sm font-bold text-[var(--accent-cobalt)]">
                            {latestLiveRun.metrics.totalRequests}
                          </div>
                        </div>
                      </div>

                      <LatencyPercentileChart
                        series={latestLiveRun.series}
                        p95ThresholdMs={latestLiveRun.thresholds.p95LimitMs}
                        height={165}
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)]/50 p-6 text-center space-y-2">
                      <div className="text-xs font-mono font-bold text-[var(--accent-lime-text)]">
                        NO DUMMY DATA LOADED — WAITING FOR YOUR FIRST TEST RUN
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                        Click <strong className="text-[var(--text-primary)]">&ldquo;Run Live Server Probe Now&rdquo;</strong> above to execute a real server-side benchmark and watch the latency percentiles, RPS, and PostgreSQL pool metrics stream in real time.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                  <span>All runs executed here also populate your Console Dashboard</span>
                  <button
                    type="button"
                    onClick={() => navigate('app-overview')}
                    className="text-[var(--accent-cobalt)] hover:underline cursor-pointer"
                  >
                    Go to Console &rarr;
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* STEP-BY-STEP DEMO INSTRUCTIONS ON HOME PAGE */}
        <section className="max-w-[1360px] mx-auto px-6 py-14 border-b border-[var(--border-subtle)]">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <div className="text-xs font-mono font-bold text-[var(--accent-lime-text)] mb-1">
                INTERACTIVE DEMO WALKTHROUGH GUIDE
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                How to test and verify the dynamic engineering workflow
              </h2>
            </div>
            <p className="text-xs font-mono text-[var(--text-muted)]">
              Follow these 4 steps to experience the complete real-time lifecycle
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: 'STEP 01 · VERIFY TARGET',
                title: 'Inspect or Probe Your Server Target',
                instruction:
                  'Open Servers & Targets (/app/targets) and click "Verify Health" to trigger a live SSRF-guarded loopback probe against /api/health.',
                cta: 'Open Targets',
                route: 'app-targets' as RouteId,
              },
              {
                step: 'STEP 02 · EXECUTE LIVE LOAD',
                title: 'Launch a 20 VU vs 50 VU Test Run',
                instruction:
                  'Use the Home Demo Sandbox above or the 5-Step Wizard (/app/create-test) to run a 20 VU Load Test followed by a 50 VU Pool Stress Test.',
                cta: 'Open Test Wizard',
                route: 'app-create-test' as RouteId,
              },
              {
                step: 'STEP 03 · WATCH LIVE STREAM',
                title: 'Observe Tick-by-Tick Telemetry',
                instruction:
                  'In Live Monitoring (/app/live), watch p50/p95/p99 latency, RPS, and PostgreSQL Pool WaitMs update every second—or test Emergency Stop.',
                cta: 'Open Live Monitor',
                route: 'app-live' as RouteId,
              },
              {
                step: 'STEP 04 · ANALYZE & COMPARE',
                title: 'Log Bottlenecks & Diff Two Runs',
                instruction:
                  'Visit Performance Analysis (/app/analysis) to see dynamically computed bottlenecks from your run and log them to POST /api/issues.',
                cta: 'Open Analysis',
                route: 'app-analysis' as RouteId,
              },
            ].map((item, idx) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: idx * 0.05 }}
                className="surface-shiny rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-mono font-bold text-[var(--accent-cobalt)] mb-2">
                    {item.step}
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-5">
                    {item.instruction}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(item.route)}
                  className="inline-flex items-center justify-between w-full px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-[var(--accent-lime)] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                >
                  <span>{item.cta}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--accent-lime-text)]" />
                </button>
              </motion.div>
            ))}
          </div>
        </section>

        {/* PROBLEM vs SOLUTION */}
        <section className="max-w-[1360px] mx-auto px-6 py-16 border-b border-[var(--border-subtle)]">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-3">
              Why backend teams replace guesswork with controlled load engineering
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              An API endpoint that responds in 4ms during single-user manual testing often queues up when 50 concurrent requests contend for a 20-connection PostgreSQL pool.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="surface-shiny rounded-xl p-6">
              <div className="text-xs font-mono text-[var(--status-error)] mb-2">
                UNMEASURED DEPLOYMENT WORKFLOW
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
                Guessing server behavior from single-request latency
              </h3>
              <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
                <li>
                  1. Relying on average response time instead of{' '}
                  <code className="font-mono text-xs">p95</code> and{' '}
                  <code className="font-mono text-xs">p99</code> tail percentiles.
                </li>
                <li>
                  2. Discovering PostgreSQL <code className="font-mono text-xs">DB_POOL_MAX=20</code>{' '}
                  exhaustion only when users experience HTTP 500 timeouts.
                </li>
                <li>
                  3. Missing CPU-bound event loop stalls caused by concurrent{' '}
                  <code className="font-mono text-xs">bcryptjs</code> key derivation.
                </li>
                <li>
                  4. Unverified rate-limiter thresholds (
                  <code className="font-mono text-xs">429 Retry-After</code>) blocking legitimate bursts.
                </li>
              </ul>
            </div>

            <div className="surface-shiny rounded-xl p-6 border border-[var(--border-strong)]">
              <div className="text-xs font-mono text-[var(--accent-lime-text)] mb-2">
                PULSEBENCH DYNAMIC ENGINEERING WORKFLOW
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
                Real-time load probes correlated with database pool telemetry
              </h3>
              <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
                <li>
                  1. Configure deterministic ramp-up profiles and concurrency limits against authorized targets.
                </li>
                <li>
                  2. Separate connection pool queue wait (<code className="font-mono text-xs">WaitMs</code>)
                  from actual SQL execution duration (<code className="font-mono text-xs">SqlMs</code>).
                </li>
                <li>
                  3. Convert dynamically detected anomalies directly into tracked engineering issues (
                  <code className="font-mono text-xs">POST /api/issues</code>).
                </li>
                <li>
                  4. Inspect live background HTTP wire logs via the built-in DevTools Console.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section className="max-w-[1360px] mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">
            Frequently Asked Engineering Questions
          </h2>
          <div className="space-y-3 max-w-3xl">
            {faqs.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="surface-shiny rounded-xl">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-subtle)] pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

// --- 2. PRODUCT & STAGE 1-8 REPOSITORY AUDIT PAGE ---
export const ProductPage: React.FC = () => {
  const { navigate } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />
      <main className="flex-1 max-w-[1360px] mx-auto w-full px-6 py-12 space-y-14">
        <div className="border-b border-[var(--border-subtle)] pb-8">
          <InlineMeta
            items={[
              'Stage 1 & 2 Deliverable',
              'Repository Audit: github.com/adityasinghr651/Lab_Engineering (project/)',
              'Information Architecture & Capability Matrix',
            ]}
          />
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] mt-3 mb-3">
            Platform Architecture & Repository Audit
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-3xl leading-relaxed">
            A transparent technical breakdown of the existing <code className="font-mono">project/</code>{' '}
            backend in <code className="font-mono">adityasinghr651/Lab_Engineering</code>, how its modules are preserved and extended, and what is dynamically executed versus planned.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            01. Repository Audit (<code className="font-mono text-base">project/</code> Directory Only)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="surface-shiny p-5 rounded-xl space-y-2">
              <div className="text-xs font-mono text-[var(--accent-cobalt)]">RUNTIME & MIDDLEWARE</div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Express 5 + Zod + Sliding-Window Rate Limiter
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Entry point <code className="font-mono">project/server.js</code> mounts{' '}
                <code className="font-mono">src/app.js</code> with{' '}
                <code className="font-mono">requestLogger</code>, custom{' '}
                <code className="font-mono">createRateLimiter</code> (
                <code className="font-mono">loginLimiter</code> returning HTTP 429 with{' '}
                <code className="font-mono">Retry-After</code>), <code className="font-mono">zod</code>{' '}
                validation middleware, and a 10-second graceful shutdown watchdog.
              </p>
            </div>

            <div className="surface-shiny p-5 rounded-xl space-y-2">
              <div className="text-xs font-mono text-[var(--accent-lime-text)]">
                DATABASE & POOL TELEMETRY
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                PostgreSQL Pool (<code className="font-mono">pg</code>) +{' '}
                <code className="font-mono">TRACK_POOL_METRICS</code>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <code className="font-mono">src/config/db.js</code> initializes{' '}
                <code className="font-mono">Pool</code> with{' '}
                <code className="font-mono">DB_POOL_MAX=20</code>.{' '}
                <code className="font-mono">src/repositories/issue.repository.js</code> includes{' '}
                <code className="font-mono">TRACK_POOL_METRICS</code> measuring pool acquire wait (
                <code className="font-mono">t1 - t0</code>) and SQL execution time (
                <code className="font-mono">q1 - q0</code>).
              </p>
            </div>

            <div className="surface-shiny p-5 rounded-xl space-y-2">
              <div className="text-xs font-mono text-[var(--accent-cobalt)]">
                RELATIONAL SCHEMA (schema.sql)
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Users, Projects, Issues & Comments
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                4 core tables with foreign-key cascades and check constraints:{' '}
                <code className="font-mono">users</code>, <code className="font-mono">projects</code>,{' '}
                <code className="font-mono">issues</code>, and <code className="font-mono">comments</code>.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            02. Complete Product Sitemap
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="surface-shiny p-5 rounded-xl space-y-3">
              <div className="text-xs font-mono text-[var(--accent-cobalt)]">PUBLIC & DOCS ROUTES</div>
              <ul className="space-y-2 text-xs">
                {[
                  ['home', '/ — Home & Interactive Demo Sandbox'],
                  ['product', '/product — Architecture & Repo Audit'],
                  ['docs', '/docs — Documentation Hub'],
                  ['community', '/community — Open Source & Roadmap'],
                ].map(([r, label]) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => navigate(r as RouteId)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono cursor-pointer"
                    >
                      {label} &rarr;
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-shiny p-5 rounded-xl space-y-3">
              <div className="text-xs font-mono text-[var(--accent-lime-text)]">
                AUTHENTICATED CONSOLE (/app/*)
              </div>
              <ul className="space-y-2 text-xs">
                {[
                  ['app-overview', '/app/overview — Dynamic Telemetry Overview'],
                  ['app-targets', '/app/targets — Authorized Servers & Targets'],
                  ['app-create-test', '/app/create-test — 5-Step Load Wizard'],
                  ['app-live', '/app/live — Live Test Monitoring'],
                  ['app-runs', '/app/runs — Executed Test Runs & Results'],
                  ['app-analysis', '/app/analysis — Dynamic Bottleneck Diagnostics'],
                  ['app-reports', '/app/reports — Printable & Exportable Reports'],
                  ['app-comparisons', '/app/comparisons — Run Diff & Regressions'],
                  ['app-integrations', '/app/integrations — API Map & Design System'],
                  ['app-settings', '/app/settings — User & Safety Limits'],
                ].map(([r, label]) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => navigate(r as RouteId)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono cursor-pointer"
                    >
                      {label} &rarr;
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-shiny p-5 rounded-xl space-y-3">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                AUTH, LEGAL & SYSTEM STATES
              </div>
              <ul className="space-y-2 text-xs">
                {[
                  ['auth-signin', '/auth/signin — JWT Sign In'],
                  ['auth-signup', '/auth/signup — Account Registration'],
                  ['auth-forgot', '/auth/forgot-password — Recovery Flow'],
                  ['auth-expired', '/auth/expired — Token Expiration View'],
                  ['legal-security', '/legal/security — SSRF & Responsible Testing'],
                  ['legal-privacy', '/legal/privacy — Privacy & Terms'],
                  ['status-404', '/status/404 — 404 / 403 / 500 / Maintenance'],
                ].map(([r, label]) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => navigate(r as RouteId)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono cursor-pointer"
                    >
                      {label} &rarr;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

// --- 3. DOCUMENTATION WEBSITE ---
const DOC_SECTIONS = [
  {
    id: 'intro',
    title: '01. Introduction & Dynamic Architecture',
    category: 'Getting Started',
    summary: 'How PulseBench executes real server-side benchmarks with zero static dummy data.',
    content: `PulseBench is an open-source server performance testing, real-time monitoring, and bottleneck analysis platform built on the adityasinghr651/Lab_Engineering (project/) architecture.

All telemetry in the console starts at zero. When you launch a test via the Home Page Demo Sandbox or the Create Test Wizard, the backend spawns a real tick-by-tick probe loop that dispatches HTTP requests, records actual response latencies, and updates PostgreSQL pool metrics in real time.`,
    code: `# Verify the PulseBench / Lab_Engineering API health endpoint
curl -i http://localhost:3000/api/health`,
  },
  {
    id: 'quickstart',
    title: '02. Quick Start',
    category: 'Getting Started',
    summary: 'Run your first dynamic load test in 3 steps.',
    content: `1. On the Home Page (/) or in Create Test (/app/create-test), select your target endpoint (e.g., GET /api/issues?page=1&limit=20).
2. Choose Virtual Users (e.g., 20 VUs for Load or 50 VUs for Pool Stress) and duration (e.g., 10s).
3. Launch the test and watch Live Monitoring (/app/live) stream second-by-second p50/p95/p99 latency and RPS.`,
    code: `curl -X POST http://localhost:3000/api/load-runs/execute \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Quick Start Load Test","targetId":1,"endpointPath":"/api/issues?page=1&limit=20","virtualUsers":20,"durationSec":10}'`,
  },
  {
    id: 'metrics',
    title: '03. Understanding Metrics (p50, p95, p99 & Pool Wait)',
    category: 'Telemetry & Analysis',
    summary: 'Interpreting tail percentiles and PostgreSQL DB_POOL_MAX contention.',
    content: `- p50 (Median): 50% of requests complete faster than this value.
- p95 (Tail Latency): 95% of requests complete faster; primary SLO gate.
- p99 (Extreme Tail): Captures worst-case queueing and GC/CPU spikes.
- Pool WaitMs vs SqlMs: When Virtual Users exceed DB_POOL_MAX (20), WaitMs rises sharply as requests wait for an available database client.`,
    code: `curl -s http://localhost:3000/api/telemetry/pool`,
  },
  {
    id: 'api-reference',
    title: '04. API Reference & Contracts',
    category: 'Reference',
    summary: 'Complete reference of implemented project/ endpoints and dynamic load runner routes.',
    content: `All Lab_Engineering endpoints are mounted at /api/* and logged in real time to the Background Developer Tools Inspector.`,
    code: `GET    /api/health
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/projects
POST   /api/projects
GET    /api/issues
POST   /api/issues
GET    /api/telemetry/pool
GET    /api/devtools/logs
POST   /api/targets/verify
GET    /api/load-runs
POST   /api/load-runs/execute
POST   /api/load-runs/:id/stop
DELETE /api/load-runs`,
  },
];

export const DocsPage: React.FC = () => {
  const [activeDocId, setActiveDocId] = useState<string>(DOC_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredDocs = DOC_SECTIONS.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentDoc = DOC_SECTIONS.find((d) => d.id === activeDocId) || DOC_SECTIONS[0];
  const currentIdx = DOC_SECTIONS.findIndex((d) => d.id === currentDoc.id);
  const prevDoc = currentIdx > 0 ? DOC_SECTIONS[currentIdx - 1] : null;
  const nextDoc = currentIdx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[currentIdx + 1] : null;

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />
      <div className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter documentation..."
              aria-label="Filter documentation"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
            />
          </div>

          <nav aria-label="Documentation Sections" className="space-y-1">
            {filteredDocs.map((doc) => {
              const active = doc.id === currentDoc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveDocId(doc.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--accent-cobalt-soft)] text-[var(--accent-cobalt)] font-semibold border border-[var(--accent-cobalt)]/30'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {doc.title}
                </button>
              );
            })}
          </nav>
        </aside>

        <article className="lg:col-span-9 surface-shiny rounded-2xl p-6 space-y-6">
          <div className="border-b border-[var(--border-subtle)] pb-5">
            <InlineMeta items={['Documentation', currentDoc.category, currentDoc.title]} />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] mt-2 mb-2">
              {currentDoc.title}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">{currentDoc.summary}</p>
          </div>

          <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
            {currentDoc.content}
          </div>

          <CodeBlock code={currentDoc.code} title={`${currentDoc.id} — Executable Example`} />

          <div className="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between gap-4">
            {prevDoc ? (
              <button
                type="button"
                onClick={() => setActiveDocId(prevDoc.id)}
                className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-left cursor-pointer"
              >
                <div className="text-[11px] font-mono text-[var(--text-muted)]">&larr; Previous</div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">{prevDoc.title}</div>
              </button>
            ) : (
              <div />
            )}
            {nextDoc && (
              <button
                type="button"
                onClick={() => setActiveDocId(nextDoc.id)}
                className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-right cursor-pointer"
              >
                <div className="text-[11px] font-mono text-[var(--text-muted)]">Next &rarr;</div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">{nextDoc.title}</div>
              </button>
            )}
          </div>
        </article>
      </div>
      <PublicFooter />
    </div>
  );
};

// --- 4. COMMUNITY & OPEN-SOURCE PAGE ---
export const CommunityPage: React.FC = () => {
  const { navigate } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-12 space-y-12">
        <div className="border-b border-[var(--border-subtle)] pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <InlineMeta items={['Open-Source Community', 'Repository: adityasinghr651/Lab_Engineering']} />
            <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mt-2 mb-2">
              Community, Contribution Guide & Roadmap
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
              Contribute to an open-source server performance engineering tool built for backend students, developers, and SRE teams.
            </p>
          </div>
          <a
            href="https://github.com/adityasinghr651/Lab_Engineering/tree/main/project"
            target="_blank"
            rel="noreferrer"
            className="btn-cobalt-shiny inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white rounded-lg"
          >
            <GitBranch className="w-4 h-4" />
            <span>Open GitHub Repository</span>
          </a>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              area: 'Database Indexing · project/src/db/schema.sql',
              title: 'Add pg_trgm GIN index for issue search queries',
              desc: 'Optimize (i.title ILIKE $1 OR i.description ILIKE $1) in issue.repository.js and benchmark before/after p95 latency at 50 VUs.',
            },
            {
              area: 'Middleware · project/src/middleware/rateLimiter.js',
              title: 'Add periodic TTL sweep for expired IP windows',
              desc: 'Prevent the in-memory hits Map in createRateLimiter from retaining stale keys when unique client IPs never make a second request.',
            },
            {
              area: 'Telemetry · project/src/repositories/issue.repository.js',
              title: 'Expose histogram buckets for pool acquire wait times',
              desc: 'Extend poolMetrics to record [1ms, 5ms, 10ms, 25ms, 50ms, 100ms] bucket counts alongside avgWaitMs and maxWaitMs.',
            },
          ].map((item) => (
            <div key={item.title} className="surface-shiny p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-[var(--accent-lime-text)] mb-2">{item.area}</div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{item.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('app-create-test')}
                className="text-xs font-semibold text-[var(--accent-cobalt)] hover:underline text-left cursor-pointer"
              >
                Benchmark this in Console &rarr;
              </button>
            </div>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

// --- 5. AUTHENTICATION PAGES ---
export const AuthPages: React.FC<{ mode: RouteId }> = ({ mode }) => {
  const { navigate, loginWithApi, registerWithApi } = useApp();
  const [name, setName] = useState('Aditya Singh');
  const [email, setEmail] = useState('aditya@lab-engineering.dev');
  const [password, setPassword] = useState('password123');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoNotice(null);
    setSubmitting(true);
    try {
      if (mode === 'auth-signin') {
        await loginWithApi(email, password);
      } else if (mode === 'auth-signup') {
        await registerWithApi(name, email, password);
      } else {
        setInfoNotice(
          'Note: The existing project/ backend implements POST /auth/register, POST /auth/login, and GET /auth/me. SMTP email delivery for password reset and verification is documented as a Planned backend contract.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="surface-shiny w-full max-w-md rounded-2xl p-7 space-y-6">
          <div className="space-y-1.5">
            <InlineMeta
              items={[
                mode === 'auth-signin'
                  ? 'POST /api/auth/login'
                  : mode === 'auth-signup'
                  ? 'POST /api/auth/register'
                  : 'Auth Lifecycle State',
                'JWT Bearer Auth',
              ]}
            />
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">
              {mode === 'auth-signin' && 'Sign in to PulseBench'}
              {mode === 'auth-signup' && 'Create an Engineering Account'}
              {mode === 'auth-forgot' && 'Reset Account Password'}
              {mode === 'auth-reset' && 'Set New Password'}
              {mode === 'auth-verify' && 'Email Verification'}
              {mode === 'auth-error' && 'Authentication Error (401 / 429)'}
              {mode === 'auth-expired' && 'Session Token Expired'}
            </h1>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg border border-[var(--status-error)]/50 bg-[var(--bg-elevated)] text-xs text-[var(--status-error)] font-mono">
              {errorMsg}
            </div>
          )}

          {infoNotice && (
            <div className="p-3.5 rounded-lg border border-[var(--accent-cobalt)]/40 bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
              {infoNotice}
            </div>
          )}

          {mode === 'auth-signin' || mode === 'auth-signup' || mode === 'auth-forgot' || mode === 'auth-reset' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'auth-signup' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Full Name (2–100 chars)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  />
                </div>
              )}

              {mode !== 'auth-reset' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-mono"
                  />
                </div>
              )}

              {mode !== 'auth-forgot' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Password (min 6 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-cobalt-shiny w-full py-2.5 px-4 text-xs font-semibold text-white rounded-lg cursor-pointer"
              >
                {submitting
                  ? 'Authenticating...'
                  : mode === 'auth-signin'
                  ? 'Sign In (POST /auth/login)'
                  : mode === 'auth-signup'
                  ? 'Register Account (POST /auth/register)'
                  : 'Submit Request'}
              </button>
            </form>
          ) : (
            <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-3 text-xs text-[var(--text-secondary)]">
              <button
                type="button"
                onClick={() => navigate('auth-signin')}
                className="btn-cobalt-shiny px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
              >
                Return to Sign In
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap gap-2">
            {[
              ['auth-signin', 'Sign In'],
              ['auth-signup', 'Sign Up'],
              ['auth-forgot', 'Forgot Password'],
              ['auth-expired', 'Session Expired'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id as RouteId)}
                className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                  mode === id
                    ? 'border-[#3B82F6] text-[var(--text-primary)] bg-[var(--bg-elevated)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
};

// --- 6. LEGAL, SECURITY & SYSTEM STATUS PAGES ---
export const LegalAndStatusPages: React.FC<{ mode: RouteId }> = ({ mode }) => {
  const { navigate } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-dev-grid">
      <PublicHeader />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 space-y-8">
        <div className="flex flex-wrap gap-2 pb-4 border-b border-[var(--border-subtle)]">
          {[
            ['legal-security', 'Security & SSRF Policy'],
            ['legal-privacy', 'Privacy Policy'],
            ['legal-terms', 'Terms of Authorized Use'],
            ['legal-accessibility', 'Accessibility'],
            ['status-404', '404 Not Found'],
            ['status-403', '403 Forbidden'],
            ['status-500', '500 Server Error'],
            ['status-maintenance', 'Maintenance State'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id as RouteId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border cursor-pointer ${
                mode === id
                  ? 'border-[#3B82F6] bg-[var(--accent-cobalt-soft)] text-[var(--text-primary)] font-semibold'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="surface-shiny rounded-2xl p-8 space-y-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {mode === 'legal-security' && 'Security & Responsible Performance Testing Policy'}
            {mode === 'legal-privacy' && 'Privacy Policy'}
            {mode === 'legal-terms' && 'Terms of Service — Authorized Target Testing'}
            {mode === 'legal-accessibility' && 'Accessibility Statement'}
            {mode.startsWith('status-') && `System Status View (${mode.replace('status-', '').toUpperCase()})`}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            PulseBench enforces SSRF protection, concurrency caps, secret redaction, and WCAG AA contrast across both Midnight Black dark mode and high-contrast light mode.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
};
