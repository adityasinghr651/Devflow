import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gauge,
  Plus,
  Radio,
  Server,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Target, Run } from '../../types/index.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { formatErrorRate, formatErrorBreakdown } from '../../utils/metrics.ts';

interface OverviewViewProps {
  targets: Target[];
  runs: Run[];
  completed: Run[];
  activeRuns: Run[];
  latest?: Run;
  onNavigate: (page: string) => void;
  onSelectRun: (run: Run) => void;
  onShowTargetModal: () => void;
  onShowTestModal: () => void;
  onSimulateRun?: () => void;
  setTestTarget: (id: string) => void;
  fmt: (n: number) => string;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  targets,
  runs,
  completed,
  activeRuns,
  latest,
  onNavigate,
  onSelectRun,
  onShowTargetModal,
  onShowTestModal,
  onSimulateRun,
  setTestTarget,
  fmt,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Compute Key Metrics
  const totalRuns = runs.length;
  const avgResponseTime =
    completed.length > 0
      ? (completed.reduce((sum, r) => sum + (r.p95 || 0), 0) / completed.length).toFixed(1)
      : null;

  const currentRps = latest ? latest.rps.toFixed(1) : null;
  const errorRateStr = latest
    ? formatErrorRate(latest.errorRate, latest.failedCount, latest.totalRequests)
    : '0.00%';
  const errorBreakdownStr = latest
    ? formatErrorBreakdown(latest.failedCount, latest.totalRequests, latest.errorRate)
    : null;

  // Sparkline data points for performance graph
  const chartRuns = completed.length >= 3 ? completed.slice(0, 12).reverse() : [];
  const chartPoints: number[] =
    chartRuns.length >= 3
      ? chartRuns.map((r) => Math.min(80, Math.max(8, r.p95 || 20)))
      : [];

  return (
    <div className="overview-container page-animate">
      {/* 1. Subtle Callout Banner */}
      <div className="dev-card overview-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="feature-icon-box" style={{ width: '36px', height: '36px' }}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                Bounded-Memory Latency Histograms
              </b>
              <span className="status-pill completed">
                <i /> Phase 6.1 Validated
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Sub-millisecond latency histograms with guaranteed fixed O(1) memory and real-time Server-Sent Events push.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {onSimulateRun && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSimulateRun}
              title="Trigger a real-time live test simulation"
            >
              <Zap size={13} style={{ color: 'var(--color-blue)' }} />
              <span>Simulate Live Run</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onShowTestModal}
          >
            <Plus size={14} />
            <span>Run Test</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Dashboard Metric Cards (Requirement 5) */}
      <div className="overview-metric-grid">
        {/* Metric 1: Total Test Runs */}
        <div
          className="metric-box-clean interactive-metric"
          onClick={() => onNavigate('Test Runs')}
          title="Click to view all test runs"
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-label">
            <span>Total Test Runs</span>
            <Activity size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">{fmt(totalRuns)}</div>
          <div className="metric-sub">
            <span style={{ color: 'var(--color-lime)', fontWeight: 600 }}>{completed.length} completed</span>
            <span>•</span>
            <span>{activeRuns.length} running</span>
          </div>
        </div>

        {/* Metric 2: Average Response Time */}
        <div
          className="metric-box-clean interactive-metric"
          onClick={() => onNavigate('Live Metrics')}
          title="Click to view live latency histogram"
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-label">
            <span>Average Response Time</span>
            <Clock size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">
            {avgResponseTime ? (
              <>
                {avgResponseTime} <small style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>ms</small>
              </>
            ) : (
              <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>No data yet</span>
            )}
          </div>
          <div className="metric-sub">
            <span>{avgResponseTime ? 'p95 average over all runs' : 'Awaiting completed test runs'}</span>
          </div>
        </div>

        {/* Metric 3: Requests Per Second */}
        <div
          className="metric-box-clean interactive-metric"
          onClick={() => onNavigate('Test Runs')}
          title="Click to inspect throughput"
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-label">
            <span>Requests Per Second</span>
            <Gauge size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">
            {currentRps ? (
              <>
                {currentRps} <small style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>req/s</small>
              </>
            ) : (
              <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>No data yet</span>
            )}
          </div>
          <div className="metric-sub">
            <span>{latest ? `Target: ${latest.targetName}` : 'Awaiting test execution'}</span>
          </div>
        </div>

        {/* Metric 4: Error Rate */}
        <div
          className="metric-box-clean interactive-metric"
          onClick={() => onNavigate('History')}
          title="Click to view error distribution"
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-label">
            <span>Error Rate</span>
            <CheckCircle2 size={15} style={{ color: 'var(--color-lime)' }} />
          </div>
          <div className="metric-value" style={{ color: (latest?.failedCount || 0) === 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
            {latest ? errorRateStr : <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>No data yet</span>}
          </div>
          <div className="metric-sub">
            <span>{errorBreakdownStr || 'Target response reliability'}</span>
          </div>
        </div>
      </div>

      {/* 3. Performance Graph & Quick Actions (Requirement 5) */}
      <div className="overview-graph-panel dev-card">
        <div className="graph-panel-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: 'var(--color-blue)' }} />
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Response Time Trends (p95 ms)
              </h3>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Historical latency measurements across completed load test runs
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onShowTargetModal}
            >
              <Plus size={13} />
              <span>Add API Target</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onShowTestModal}
            >
              <Plus size={13} />
              <span>Run Test</span>
            </button>
          </div>
        </div>

        {/* Interactive SVG Response Time Chart */}
        <div style={{ width: '100%', height: '140px', marginTop: '16px', position: 'relative' }}>
          {chartPoints.length >= 3 ? (
            <>
              <svg
                viewBox="0 0 800 130"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%' }}
              >
                <defs>
                  <linearGradient id="overviewAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid guide lines */}
                <line x1="0" y1="30" x2="800" y2="30" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <line x1="0" y1="70" x2="800" y2="70" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <line x1="0" y1="110" x2="800" y2="110" stroke="var(--border-subtle)" strokeDasharray="3 3" />

                {/* Area */}
                <polygon
                  points={`0,130 ${chartPoints
                    .map((val, idx) => `${(idx / (chartPoints.length - 1)) * 800},${115 - val * 2.2}`)
                    .join(' ')} 800,130`}
                  fill="url(#overviewAreaGrad)"
                />

                {/* Polyline */}
                <polyline
                  points={chartPoints
                    .map((val, idx) => `${(idx / (chartPoints.length - 1)) * 800},${115 - val * 2.2}`)
                    .join(' ')}
                  fill="none"
                  stroke="var(--color-lime)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Interactive Data point dots */}
                {chartPoints.map((val, idx) => {
                  const cx = (idx / (chartPoints.length - 1)) * 800;
                  const cy = 115 - val * 2.2;
                  const isHovered = hoveredIdx === idx;
                  const runAtPoint = chartRuns[idx];

                  return (
                    <g key={idx}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : idx === chartPoints.length - 1 ? 4 : 3}
                        fill={isHovered ? 'var(--color-lime-hover)' : idx === chartPoints.length - 1 ? 'var(--color-lime)' : 'var(--bg-card)'}
                        stroke="var(--color-lime)"
                        strokeWidth={isHovered ? 2.5 : 1.5}
                        style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => {
                          if (runAtPoint) onSelectRun(runAtPoint);
                        }}
                      />
                      {/* Invisible hit area for easier mouse targeting */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={14}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => {
                          if (runAtPoint) onSelectRun(runAtPoint);
                        }}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Interactive Tooltip when hovering over a chart point */}
              {hoveredIdx !== null && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${Math.max(0, 115 - chartPoints[hoveredIdx] * 2.2 - 40)}px`,
                    left: `${Math.min(720, Math.max(10, (hoveredIdx / (chartPoints.length - 1)) * 100))}%`,
                    transform: 'translateX(-50%)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    boxShadow: 'var(--shadow-card)',
                    pointerEvents: 'none',
                    zIndex: 10,
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{chartPoints[hoveredIdx]} ms</span>
                  {chartRuns[hoveredIdx] && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({chartRuns[hoveredIdx].targetName})
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '8px',
              }}
            >
              No data yet. Complete at least 3 load test runs to visualize latency trends.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          <span>Older Executions</span>
          <span>Hover dots for latency · Latest ({avgResponseTime} ms)</span>
        </div>
      </div>

      {/* 4. Two-Column Layout: Recent Executions & API Targets */}
      <div className="overview-split-grid">
        {/* Recent Test Executions */}
        <div className="dev-card">
          <div className="panel-header-row">
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Recent Test Executions
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest test run activity</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('Test Runs')}
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="empty-state-clean">
              <Activity size={24} style={{ color: 'var(--text-dim)' }} />
              <h4>No test executions yet</h4>
              <p>Add an API target and run your first load test to observe metrics.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onShowTestModal}
              >
                <Plus size={13} />
                <span>Run Test</span>
              </button>
            </div>
          ) : (
            <div className="clean-list">
              {runs.slice(0, 5).map((run) => (
                <div
                  key={run.id}
                  className="clean-list-item"
                  onClick={() => onSelectRun(run)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view execution telemetry details"
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <b style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                        {run.targetName}
                      </b>
                      <StatusBadge status={run.status} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {run.method || 'GET'} {run.url || '/'} • {run.concurrency || 5} VUs • {run.durationSec || 10}s
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {run.p95 ? `${run.p95.toFixed(1)} ms` : '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      {run.rps ? `${run.rps.toFixed(1)} req/s` : 'queued'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Targets Panel */}
        <div className="dev-card">
          <div className="panel-header-row">
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                API Targets
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Authorized testing endpoints</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onShowTargetModal}
            >
              <Plus size={13} />
              <span>Add API Target</span>
            </button>
          </div>

          {targets.length === 0 ? (
            <div className="empty-state-clean">
              <Server size={24} style={{ color: 'var(--text-dim)' }} />
              <h4>No API targets configured</h4>
              <p>Register an endpoint you own or have permission to test.</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onShowTargetModal}
              >
                <Plus size={13} />
                <span>Add API Target</span>
              </button>
            </div>
          ) : (
            <div className="clean-list">
              {targets.map((target) => (
                <div key={target.id} className="clean-list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <b style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                        {target.name}
                      </b>
                      {target.isDemo && <span className="env-pill">Demo data</span>}
                      {target.verified ? (
                        <span className="status-pill completed">
                          <i /> Verified
                        </span>
                      ) : (
                        <span className="status-pill">
                          <i /> Unverified
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {target.url}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setTestTarget(target.id);
                      onShowTestModal();
                    }}
                  >
                    <span>Run Test</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
