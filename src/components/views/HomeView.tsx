import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Code2,
  Gauge,
  Layers,
  Shield,
  Zap,
  CheckCircle2,
  X,
  Play,
  Terminal,
  Cpu,
  Radio,
  FileCheck2,
  GitBranch,
  BarChart3,
  ExternalLink,
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
            <Zap size={13} style={{ color: '#3B82F6', fill: '#3B82F6' }} />
            <span>Open Source • Self-hosted • Developer Tool</span>
          </div>

          {/* Headline: Test. Load. Analyze. */}
          <h1 className="hero-headline">
            Test. Load. <span className="text-blue">Analyze.</span>
          </h1>

          {/* Description */}
          <p className="hero-description">
            A powerful, extensible platform to run load tests, monitor performance, and analyze the reliability of your APIs and services.
          </p>

          {/* Action Buttons */}
          <div className="hero-cta-group">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={onStart}
            >
              <span>{user ? 'Open Workspace' : 'Get Started'}</span>
              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              className="btn-pill-subtle"
              onClick={() => onNavigatePage ? onNavigatePage('Overview') : onStart()}
            >
              <Sparkles size={14} style={{ color: '#3B82F6' }} />
              <span>Explore Demo Workspace</span>
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

          {/* 4 Feature Items with Hairline Dividers (Interactive Clickable Pills) */}
          <div className="hero-feature-bar" title="Click any feature to explore its interactive workspace">
            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('Test Runs') : onStart()}
            >
              <span className="icon-wrap">
                <Zap size={15} />
              </span>
              <span>Load Testing</span>
            </button>

            <div className="hero-feature-divider" />

            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('Live Metrics') : onStart()}
            >
              <span className="icon-wrap">
                <Gauge size={15} />
              </span>
              <span>Real-time Metrics</span>
            </button>

            <div className="hero-feature-divider" />

            <button
              type="button"
              className="hero-feature-item interactive"
              onClick={() => onNavigatePage ? onNavigatePage('Settings') : onStart()}
            >
              <span className="icon-wrap">
                <Layers size={15} />
              </span>
              <span>Multi-user</span>
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

      {/* ===================================================================
          2. INTERACTIVE LOAD TEST PLAYGROUND / LIVE SIMULATOR
          =================================================================== */}
      <section className="home-section-wrap" style={{ paddingTop: '20px' }}>
        <div className="home-demo-card">
          <div className="demo-header">
            <div className="demo-target-badge">
              <Terminal size={14} style={{ color: 'var(--color-blue)' }} />
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
                <span>p95: <b style={{ color: 'var(--color-blue)' }}>{simP95} ms</b></span>
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
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
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
                  stroke="var(--color-blue)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Pulsing latest point */}
                <circle
                  cx="700"
                  cy={110 - simPoints[simPoints.length - 1] * 2}
                  r="5"
                  fill="var(--color-blue)"
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
                  style={{ accentColor: 'var(--color-blue)', width: '130px' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{simVUs} VUs</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Phase 6.1 Validated • O(1) Fixed Memory
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
          <h2 className="section-title">Engineered for Precision & Safety</h2>
          <p className="section-subtitle">
            Everything you need to test API resilience, benchmark latency regressions in CI/CD, and measure real-world performance.
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
              <span>Inspect Phase 6.1 Bounded Metrics</span>
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
              Zero unauthorized tests. Remote targets require cryptographic DNS TXT or HTTP challenge proofs to prevent accidental SSRF.
            </p>
            <div className="feature-card-footer">
              <span>Manage API Targets</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('History')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <GitBranch size={20} />
            </div>
            <h3>Automated CI/CD Regression Gates</h3>
            <p>
              Integrate benchmark thresholds in GitHub Actions to catch throughput drops and p95/p99 tail latency degradations before production.
            </p>
            <div className="feature-card-footer">
              <span>Inspect Regression Suite</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="feature-card" onClick={() => onNavigatePage && onNavigatePage('Test Runs')} style={{ cursor: 'pointer' }}>
            <div className="feature-icon-badge">
              <Cpu size={20} />
            </div>
            <h3>Multi-Threaded Worker Execution</h3>
            <p>
              Node.js worker threads drive high-concurrency workloads without blocking the event loop or skewing metric calculations.
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
              All test executions, percentiles, error rates, and response profiles are durably stored in PostgreSQL and exportable as JSON/CSV.
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
          <span className="section-eyebrow">HOW IT WORKS</span>
          <h2 className="section-title">Test Any API in Three Steps</h2>
          <p className="section-subtitle">
            Go from an endpoint URL to comprehensive load performance metrics in minutes.
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
          <span className="section-eyebrow">COMPARISON</span>
          <h2 className="section-title">Why Developers Choose ServerTest</h2>
        </div>

        <div className="comparison-table-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>ServerTest</th>
                <th>Cloud SaaS</th>
                <th>Bash Scripts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Live Telemetry</b></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> Real-Time SSE</span></td>
                <td><span className="table-cross"><X size={15} /> Polled / Delayed</span></td>
                <td><span className="table-cross"><X size={15} /> Terminal Logs</span></td>
              </tr>
              <tr>
                <td><b>Target Safety & Anti-SSRF</b></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> Cryptographic Proof</span></td>
                <td><span className="table-cross"><X size={15} /> None</span></td>
                <td><span className="table-cross"><X size={15} /> None</span></td>
              </tr>
              <tr>
                <td><b>Bounded Memory</b></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> O(1) Fixed Histogram</span></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> Cloud Managed</span></td>
                <td><span className="table-cross"><X size={15} /> Unbounded Array</span></td>
              </tr>
              <tr>
                <td><b>Multi-Tenant Isolation</b></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> PostgreSQL + JWT</span></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> High Seat Pricing</span></td>
                <td><span className="table-cross"><X size={15} /> None</span></td>
              </tr>
              <tr>
                <td><b>Self-Hosted & Open Source</b></td>
                <td><span className="table-check"><CheckCircle2 size={15} /> Yes</span></td>
                <td><span className="table-cross"><X size={15} /> Proprietary</span></td>
                <td><span className="table-cross"><X size={15} /> Ad-hoc</span></td>
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
          <span className="section-eyebrow">PLANS & HOSTING</span>
          <h2 className="section-title">Open Source for Everyone</h2>
          <p className="section-subtitle">
            Deploy on your own infrastructure or run locally with Docker. 100% free and open-source.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-default)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-blue)', textTransform: 'uppercase' }}>Community</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>Free <small style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>forever</small></div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Self-hosted developer edition with unlimited local targets and bounded-memory histograms.
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Unlimited load tests</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Real-time SSE streaming</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> GitHub Actions CI/CD gate</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> SQLite & PostgreSQL backends</li>
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
              <div style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>RECOMMENDED</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-blue)', textTransform: 'uppercase', marginTop: '6px' }}>Team & Cloud</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>Self-Hosted <small style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>Pro</small></div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Multi-seat team performance workspaces with distributed agents and cryptographic proofs.
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Multi-user RBAC & teams</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Distributed runner clusters</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Cryptographic domain proofs</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} /> Slack & Discord webhook alerts</li>
            </ul>
            <button
              type="button"
              className="btn-hero-primary full-button"
              style={{ marginTop: 'auto' }}
              onClick={() => onNavigatePage ? onNavigatePage('Overview') : onStart()}
            >
              <span>Explore Platform</span>
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
            <h2>Ready to Test Your APIs?</h2>
            <p>
              Deploy controlled workloads with real-time SSE telemetry, bounded-memory histograms, and complete target safety.
            </p>
          </div>
          <button
            type="button"
            className="btn-hero-primary"
            onClick={onStart}
          >
            <span>{user ? 'Open Workspace' : 'Get Started'}</span>
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
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>ServerTest</span>
            <span className="footer-sep">•</span>
            <span>Developer Load Testing Platform</span>
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
