import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Code2,
  Gauge,
  Shield,
  Zap,
  CheckCircle2,
  Play,
  Terminal,
  Cpu,
  Radio,
  FileCheck2,
  GitBranch,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { HeroBackground } from '../ui/HeroBackground.tsx';
import { User } from '../../types/index.ts';

interface HomeViewProps {
  onStart: () => void;
  onLaunchTest: () => void;
  user: User | null;
  onNavigateDocs?: () => void;
  onNavigatePage?: (page: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onStart,
  onLaunchTest,
  user,
  onNavigateDocs,
  onNavigatePage,
}) => {
  // Interactive Simulator State
  const [simRunning, setSimRunning] = useState(true);
  const [simVUs, setSimVUs] = useState(15);
  const [simRps, setSimRps] = useState(2840);
  const [simP95, setSimP95] = useState(18.4);
  const [simPreset, setSimPreset] = useState<'normal' | 'spike' | 'stress'>('normal');
  const [simPoints, setSimPoints] = useState<number[]>([
    14, 18, 16, 22, 19, 25, 21, 28, 24, 31, 27, 29, 26, 34, 30, 32, 28, 35,
  ]);

  // Handle Preset Changes
  const selectPreset = (preset: 'normal' | 'spike' | 'stress') => {
    setSimPreset(preset);
    if (preset === 'normal') {
      setSimVUs(15);
    } else if (preset === 'spike') {
      setSimVUs(50);
    } else if (preset === 'stress') {
      setSimVUs(100);
    }
  };

  // Live simulation tick
  useEffect(() => {
    if (!simRunning) return;

    const interval = setInterval(() => {
      const noise = (Math.random() - 0.5) * 80;
      const baseRps = simVUs * 180;
      const newRps = Math.max(100, Math.round(baseRps + noise));
      setSimRps(newRps);
      
      const latencyNoise = (Math.random() - 0.5) * 2;
      const newP95 = Number((14 + (simVUs / 20) * 4 + latencyNoise).toFixed(1));
      setSimP95(newP95);

      setSimPoints((prev) => {
        const nextVal = Math.min(48, Math.max(10, Math.round(newP95 * 1.3 + (Math.random() - 0.5) * 5)));
        return [...prev.slice(1), nextVal];
      });
    }, 1100);

    return () => clearInterval(interval);
  }, [simRunning, simVUs]);

  return (
    <div className="home-page-container page-animate">
      {/* ===================================================================
          1. HERO SECTION (Directly matching the user's reference image)
          =================================================================== */}
      <section className="hero-aurora-wrap">
        <HeroBackground />

        <div className="hero-content-inner">
          {/* Top Pill Badge */}
          <div className="hero-badge-pill">
            <Zap size={13} style={{ color: 'var(--color-lime)', fill: 'var(--color-lime)' }} />
            <span>Open Source • CI Performance Checks • Self-hosted</span>
          </div>

          {/* Lead with the CI regression-check workflow. */}
          <h1 className="hero-headline">
            Catch API regressions <span className="text-blue">in CI.</span>
          </h1>

          {/* Description */}
          <p className="hero-description">
            Run a repeatable HTTP workload for a pull request, compare it with matching history, and review a performance verdict in GitHub Actions. DevFlow's self-hosted runner powers the check.
          </p>

          {/* Action Buttons */}
          <div className="hero-cta-group">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={() => onNavigateDocs ? onNavigateDocs() : onStart()}
            >
              <span>Set up a CI check</span>
              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              className="btn-pill-subtle"
              onClick={() => onNavigatePage ? onNavigatePage('Overview') : onStart()}
            >
              <Sparkles size={14} style={{ color: 'var(--color-lime)' }} />
              <span>Explore the load-testing workspace</span>
            </button>

            <a
              href="https://github.com/adityasinghr651/Devflow"
              target="_blank"
              rel="noreferrer"
              className="btn-pill-subtle"
            >
              <Code2 size={15} />
              <span>View on GitHub</span>
            </a>
          </div>

          {/* Lead with the CI workflow; detailed workload tools remain below. */}
          <div className="hero-feature-bar" title="Click any feature to explore its interactive workspace">
            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigateDocs ? onNavigateDocs() : onStart()}
            >
              <span className="icon-wrap">
                <GitBranch size={15} />
              </span>
              <span>CI Regression Check</span>
            </button>

            <div className="hero-feature-divider" />

            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('Comparisons') : onStart()}
            >
              <span className="icon-wrap">
                <BarChart3 size={15} />
              </span>
              <span>Run Comparisons</span>
            </button>

            <div className="hero-feature-divider" />

            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('Test Runs') : onStart()}
            >
              <span className="icon-wrap">
                <Zap size={15} />
              </span>
              <span>HTTP Load Testing</span>
            </button>

            <div className="hero-feature-divider" />

            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('API Targets') : onStart()}
            >
              <span className="icon-wrap">
                <Shield size={15} />
              </span>
              <span>Secure by Design</span>
            </button>
          </div>
        </div>
      </section>

      <section id="ci-check" className="home-section-wrap">
        <div className="section-header-centered">
          <span className="section-eyebrow">THE REGRESSION GATE</span>
          <h2 className="section-title">From pull request to performance signal</h2>
          <p className="section-subtitle">
            Configure a stable, authorized endpoint once. DevFlow runs the same HTTP workload, checks comparable history, and reports only what the available data supports.
          </p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-badge"><Code2 size={20} /></div>
            <h3>1. Define the check</h3>
            <p>Save the target and workload in DevFlow, then keep the CLI config in your repository. Store API credentials in GitHub Secrets.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-badge"><GitBranch size={20} /></div>
            <h3>2. Run it in CI</h3>
            <p>The GitHub Action calls DevFlow's API and runner for the configured HTTP workload on a pull request.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-badge"><FileCheck2 size={20} /></div>
            <h3>3. Review the result</h3>
            <p>See the verdict, comparison bands, and JSON report. With too little matching history, the result is `insufficient_data`.</p>
          </div>
        </div>
        <p className="section-subtitle" style={{ textAlign: 'center', marginTop: '18px' }}>
          The external repository pilot has not run yet. Detector results so far come from controlled local studies; hosted CI behavior still needs pilot validation.
        </p>
      </section>

      {/* ===================================================================
          2. INTERACTIVE LOAD TEST PLAYGROUND / LIVE SIMULATOR
          =================================================================== */}
      <section className="home-section-wrap" style={{ paddingTop: '20px' }}>
        <div className="home-demo-card">
          <div className="demo-header">
            <div className="demo-target-badge">
              <Terminal size={14} style={{ color: 'var(--color-lime)' }} />
              <span className="target-method">POST</span>
              <span className="target-url">https://api.gateway.internal/v1/checkout</span>
              <span className="env-pill">Illustrative sample</span>
            </div>

            <div className="demo-controls">
              <span className="status-pill running">
                <i /> {simRunning ? 'Demo simulation' : 'Simulation paused'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSimRunning(!simRunning)}
              >
                {simRunning ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onLaunchTest}
              >
                <Play size={13} fill="currentColor" />
                <span>Run Real Test</span>
              </button>
            </div>
          </div>

          {/* Scenario Presets Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Interactive Preset:</span>
            <button
              type="button"
              className={`filter-tab ${simPreset === 'normal' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 10px' }}
              onClick={() => selectPreset('normal')}
            >
              Normal Load (15 VUs)
            </button>
            <button
              type="button"
              className={`filter-tab ${simPreset === 'spike' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 10px' }}
              onClick={() => selectPreset('spike')}
            >
              Flash Spike (50 VUs)
            </button>
            <button
              type="button"
              className={`filter-tab ${simPreset === 'stress' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 10px' }}
              onClick={() => selectPreset('stress')}
            >
              Stress Peak (100 VUs)
            </button>
          </div>

          {/* 4 Stat Capsules */}
          <div className="demo-metrics-row">
            <div className="demo-stat-box">
              <span className="stat-label">Requests / second</span>
              <div className="stat-value">
                {new Intl.NumberFormat('en-US').format(simRps)} <small>req/s</small>
              </div>
            </div>

            <div className="demo-stat-box">
              <span className="stat-label">Response Time (p95)</span>
              <div className="stat-value">
                {simP95} <small>ms</small>
              </div>
            </div>

            <div className="demo-stat-box">
              <span className="stat-label">Error Rate</span>
              <div className="stat-value" style={{ color: 'var(--color-lime)' }}>
                0.00%
              </div>
            </div>

            <div className="demo-stat-box">
              <span className="stat-label">Virtual Users</span>
              <div className="stat-value">
                {simVUs} <small>VUs</small>
              </div>
            </div>
          </div>

          {/* Real-time Response Time Curve */}
          <div className="demo-chart-container">
            <div className="chart-header-row">
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Response Time (ms) — Real-Time Bounded Histogram
              </span>
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                <span>p50: <b style={{ color: 'var(--text-primary)' }}>{(simP95 * 0.45).toFixed(1)} ms</b></span>
                <span>p95: <b style={{ color: 'var(--color-lime)' }}>{simP95} ms</b></span>
                <span>p99: <b style={{ color: 'var(--text-primary)' }}>{(simP95 * 1.6).toFixed(1)} ms</b></span>
              </div>
            </div>

            {/* SVG Live Response Time Polyline */}
            <div className="chart-svg-wrap">
              <svg
                viewBox="0 0 700 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
                style={{ width: '100%', height: '120px' }}
              >
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal reference lines */}
                <line x1="0" y1="30" x2="700" y2="30" stroke="var(--border-subtle)" strokeDasharray="4 4" />
                <line x1="0" y1="70" x2="700" y2="70" stroke="var(--border-subtle)" strokeDasharray="4 4" />
                <line x1="0" y1="110" x2="700" y2="110" stroke="var(--border-subtle)" strokeDasharray="4 4" />

                {/* Area fill */}
                <polygon
                  points={`0,120 ${simPoints
                    .map((val, idx) => `${(idx / (simPoints.length - 1)) * 700},${110 - val * 2}`)
                    .join(' ')} 700,120`}
                  fill="url(#chartGrad)"
                />

                {/* Curve line */}
                <polyline
                  points={simPoints
                    .map((val, idx) => `${(idx / (simPoints.length - 1)) * 700},${110 - val * 2}`)
                    .join(' ')}
                  fill="none"
                  stroke="var(--color-lime)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Pulsing latest point */}
                <circle
                  cx="700"
                  cy={110 - simPoints[simPoints.length - 1] * 2}
                  r="5"
                  fill="var(--color-lime)"
                />
              </svg>
            </div>

            <div className="chart-footer-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-dim)' }}>
                <span>Adjust Virtual Users:</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={simVUs}
                  onChange={(e) => {
                    setSimPreset('normal');
                    setSimVUs(Number(e.target.value));
                  }}
                  style={{ accentColor: 'var(--color-lime)', width: '130px' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{simVUs} VUs</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Illustrative simulator • not a live CI result
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          3. CORE FEATURES GRID
          =================================================================== */}
      <section id="features" className="home-section-wrap">
        <div className="section-header-centered">
          <span className="section-eyebrow">BUILT FOR DEVELOPERS</span>
          <h2 className="section-title">A regression check backed by real HTTP runs</h2>
          <p className="section-subtitle">
            CI comparison is the primary workflow. The load-testing dashboard remains available when you need to inspect or tune a workload.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('Live Metrics')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <Gauge size={20} />
            </div>
            <h3>Bounded-Memory Latency Histograms</h3>
            <p>
              Sub-millisecond latency histograms with guaranteed fixed O(1) memory and exact Nearest-Rank percentiles across 6,801 buckets.
            </p>
            <div className="feature-card-footer">
              <span>Inspect latency metrics</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('Live Metrics')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <Radio size={20} />
            </div>
            <h3>Real-Time SSE Telemetry Stream</h3>
            <p>
              Server-Sent Events push live progress, concurrency, throughput, and status code distributions directly to your browser.
            </p>
            <div className="feature-card-footer">
              <span>View Live Telemetry Stream</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('API Targets')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <FileCheck2 size={20} />
            </div>
            <h3>Target Domain Proof Verification</h3>
            <p>
              Remote targets require DNS TXT or HTTP challenge proofs as an additional check before they can be tested.
            </p>
            <div className="feature-card-footer">
              <span>Manage API Targets</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigateDocs ? onNavigateDocs() : onStart()} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <GitBranch size={20} />
            </div>
            <h3>CI Performance Regression Check</h3>
            <p>
              The CLI and GitHub Action compare a configured HTTP run with matching history and report a verdict. Hosted repository behavior still needs a pilot.
            </p>
            <div className="feature-card-footer">
              <span>Read CI setup guide</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('Test Runs')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <Cpu size={20} />
            </div>
            <h3>Isolated Worker Processes</h3>
            <p>
              Child processes generate the configured HTTP workload in separate event loops, keeping the API coordinator responsive.
            </p>
            <div className="feature-card-footer">
              <span>View Test Runner</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('History')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <BarChart3 size={20} />
            </div>
            <h3>Durable Audit History & Exports</h3>
            <p>
              Test executions, percentiles, and errors are stored through the configured JSON or PostgreSQL backend and can be reviewed or exported.
            </p>
            <div className="feature-card-footer">
              <span>Export Audit Reports</span>
              <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          4. HOW IT WORKS (3-Step Workflow)
          =================================================================== */}
      <section id="how-it-works" className="home-section-wrap">
        <div className="section-header-centered">
          <span className="section-eyebrow">ADVANCED: LOAD TESTING</span>
          <h2 className="section-title">Inspect and tune the HTTP workload</h2>
          <p className="section-subtitle">
            Use the dashboard for exploratory runs, live telemetry, and detailed reports. The CI gate reuses a saved workload and its matching history.
          </p>
        </div>

        <div className="how-it-works-grid">
          <div className="step-card" onClick={() => onNavigatePage && onNavigatePage('API Targets')} style={{ cursor: 'pointer' }}>
            <span className="step-number">01</span>
            <h3>Add API Target</h3>
            <p>
              Register your endpoint URL and prove domain ownership with a quick DNS TXT record or HTTP challenge file.
            </p>
          </div>

          <div className="step-card" onClick={() => onNavigatePage && onNavigatePage('Test Runs')} style={{ cursor: 'pointer' }}>
            <span className="step-number">02</span>
            <h3>Run Test</h3>
            <p>
              Choose fixed virtual user concurrency or design multi-stage traffic curves to simulate real-world spikes.
            </p>
          </div>

          <div className="step-card" onClick={() => onNavigatePage && onNavigatePage('Overview')} style={{ cursor: 'pointer' }}>
            <span className="step-number">03</span>
            <h3>Analyze Response Time</h3>
            <p>
              Observe real-time throughput, inspect latency percentiles (p50, p95, p99), and export durable test reports.
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================================
          5. ARCHITECTURE COMPARISON TABLE
          =================================================================== */}
      <section className="home-section-wrap">
        <div className="section-header-centered">
          <span className="section-eyebrow">WHAT THE CHECK DOES</span>
          <h2 className="section-title">How DevFlow fits into a pull request</h2>
        </div>

        <div className="comparison-table-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>DevFlow</th>
                <th>Manual workflow</th>
                <th>Current evidence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Repeatable workload</b></td>
                <td>Runs a configured HTTP workload</td>
                <td>Run and inspect a load test separately</td>
                <td>CLI and API exercised locally</td>
              </tr>
              <tr>
                <td><b>Comparable history</b></td>
                <td>Checks the run against matching history</td>
                <td>Requires a separate baseline process</td>
                <td>At least three comparable runs are needed</td>
              </tr>
              <tr>
                <td><b>CI report</b></td>
                <td>Verdict, metric bands, JSON artifact</td>
                <td>Review and publish results manually</td>
                <td>Action logic uses mocked GitHub calls</td>
              </tr>
              <tr>
                <td><b>Pull request integration</b></td>
                <td>GitHub Action comments on the PR</td>
                <td>Requires custom CI wiring</td>
                <td>Hosted pilot still pending</td>
              </tr>
              <tr>
                <td><b>Tool fit</b></td>
                <td>HTTP workloads through DevFlow's runner</td>
                <td>Tools such as k6 and Locust are valid options</td>
                <td>No head-to-head or superiority claim</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================
          6. PRICING & DEPLOYMENT TIERS
          =================================================================== */}
      <section id="pricing" className="home-section-wrap">
        <div className="section-header-centered">
          <span className="section-eyebrow">CURRENT ACCESS & FUTURE OPTIONS</span>
          <h2 className="section-title">Current tiers and a hosted-service hypothesis</h2>
          <p className="section-subtitle">
            DevFlow has no checkout or paid hosted service. Current account limits are enforced by the platform; future hosted features are only a pre-pilot hypothesis.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-default)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-blue)', textTransform: 'uppercase' }}>Implemented access tiers</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>Free &amp; Pro</div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Free is available at signup. Pro is currently admin-assigned; no checkout or subscription billing is connected.
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Free: 15 accepted runs over the account lifetime</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Pro: 10,000 runs by default, configurable by the operator</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Pro includes campaigns and own-run deletion</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> No payment required; self-hosted platform</li>
            </ul>
            <button
              type="button"
              className="btn-hero-primary full-button"
              style={{ marginTop: 'auto' }}
              onClick={onStart}
            >
              <span>Get Started</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%)' }}>
            <div>
              <div style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>UNDER EVALUATION</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-blue)', textTransform: 'uppercase', marginTop: '6px' }}>Possible hosted service</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>Not available</div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                A hypothesis to validate with pilot teams. No paid hosted plan, launch date, or price has been decided.
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Hosted run history and retention</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Shared team workspaces</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Alerts and CI integrations</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Features depend on pilot feedback</li>
            </ul>
            <button
              type="button"
              className="btn-hero-primary full-button"
              style={{ marginTop: 'auto' }}
              onClick={() => onNavigateDocs ? onNavigateDocs() : onStart()}
            >
              <span>Read CI setup guide</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================
          7. CALL TO ACTION BANNER
          =================================================================== */}
      <section className="home-section-wrap" style={{ paddingBottom: '60px' }}>
        <div className="home-cta-card">
          <div>
            <h2>Ready to add a performance check to CI?</h2>
            <p>
              Start with the setup guide. Use an authorized test or staging target; the hosted pilot is still pending.
            </p>
          </div>
          <button
            type="button"
            className="btn-hero-primary"
            onClick={() => onNavigateDocs ? onNavigateDocs() : onStart()}
          >
            <span>Read the CI setup guide</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ===================================================================
          8. CLEAN DEVELOPER FOOTER
          =================================================================== */}
      <footer className="home-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>DevFlow</span>
            <span className="footer-sep">•</span>
            <span>HTTP performance regression checks</span>
            <span className="footer-sep">•</span>
            <span>Built for measured experiments</span>
          </div>

          <div className="footer-right">
            <button
              type="button"
              className="footer-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => onNavigatePage && onNavigatePage('Overview')}
            >
              Dashboard
            </button>
            <a
              href="#features"
              className="footer-link"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="footer-link"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              How It Works
            </a>
            {onNavigateDocs && (
              <button
                type="button"
                className="footer-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={onNavigateDocs}
              >
                Documentation
              </button>
            )}
            <a
              href="https://github.com/adityasinghr651/Devflow"
              target="_blank"
              rel="noreferrer"
              className="footer-link"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
