import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  Clock,
  Cpu,
  Download,
  Gauge,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import { Run, LiveMetrics, Target } from '../../types/index.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { formatErrorRate, formatErrorBreakdown } from '../../utils/metrics.ts';

interface LiveMetricsViewProps {
  runs: Run[];
  selectedRun: Run | null;
  onSelectRun: (run: Run) => void;
  liveMetrics: LiveMetrics;
  onStopRun: (id: string) => void;
  onNewTestClick: () => void;
  onSimulateRun?: () => void;
  fmt: (n: number) => string;
}

export const LiveMetricsView: React.FC<LiveMetricsViewProps> = ({
  runs,
  selectedRun,
  onSelectRun,
  liveMetrics,
  onStopRun,
  onNewTestClick,
  onSimulateRun,
  fmt,
}) => {
  // If no run selected, pick the latest active or completed run
  const activeRun =
    selectedRun ||
    runs.find((r) => ['running', 'queued', 'validating'].includes(r.status)) ||
    runs[0];

  const isRunning = activeRun ? ['running', 'queued', 'validating'].includes(activeRun.status) : false;

  // Real-time animation buffer for live curve
  const [streamPoints, setStreamPoints] = useState<number[]>([]);

  // Terminal event stream logs
  const [logs, setLogs] = useState<string[]>([]);

  // Push live telemetry data points every 900ms when running
  useEffect(() => { setStreamPoints([]); setLogs([]); }, [activeRun?.id]);

  if (!activeRun) {
    return (
      <div className="dev-card page-animate" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div className="empty-state-clean">
          <Radio size={36} style={{ color: 'var(--color-blue)', marginBottom: '12px' }} />
          <h3>No Active Live Telemetry Streams</h3>
          <p style={{ maxWidth: '440px', margin: '0 auto 20px' }}>
            Launch a load test to stream real-time sub-millisecond metrics, throughput gauges, and latency histogram distributions.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={onNewTestClick}>
              <Play size={14} fill="currentColor" />
              <span>Start Real Load Test</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Latency bucket estimations for Phase 6.1 visualization
  const p95Val = activeRun.p95 > 0 ? activeRun.p95 : null;
  const p50Val = activeRun.p50 > 0 ? activeRun.p50 : null;
  const p99Val = activeRun.p99 > 0 ? activeRun.p99 : null;
  const currentRps = liveMetrics.rps ?? activeRun.rps;
  const currentReqs = liveMetrics.totalRequests ?? activeRun.totalRequests;
  const progressPercent = liveMetrics.progressPercent ?? activeRun.progressPercent ?? 0;

  return (
    <div className="page-animate" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Active Stream Header Card */}
      <div className="dev-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className={`status-pill ${isRunning ? 'running' : 'completed'}`}>
                <i className={isRunning ? 'pulse-dot' : ''} />
                {isRunning ? 'LIVE SSE TELEMETRY STREAM' : 'COMPLETED EXECUTION SNAPSHOT'}
              </span>
              <span className="env-pill" style={{ fontFamily: 'var(--font-mono)' }}>
                {activeRun.id}
              </span>
              <span className="env-pill">
                {activeRun.profile === 'stages' ? 'Staged Ramp-Up' : 'Fixed Concurrency'}
              </span>
              {activeRun.isDemo && <span className="env-pill">Demo data</span>}
            </div>

            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeRun.targetName}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{activeRun.method || 'POST'}</span>
              <span>{activeRun.url}</span>
              <span>•</span>
              <span>{activeRun.concurrency} Virtual Users</span>
              <span>•</span>
              <span>{activeRun.durationSec}s Target Duration</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isRunning && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onStopRun(activeRun.id)}
              >
                <Square size={13} fill="currentColor" />
                <span>Stop Execution</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNewTestClick}
            >
              <Play size={13} fill="currentColor" />
              <span>New Load Test</span>
            </button>
          </div>
        </div>

        {/* Live Progress Bar */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>Workload Execution Progress: <b style={{ color: 'var(--text-primary)' }}>{progressPercent}%</b></span>
            <span>Target: <b style={{ color: 'var(--text-primary)' }}>{activeRun.durationSec}s</b></span>
          </div>
          <div style={{ height: '6px', width: '100%', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 50%, #B7F500 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Key Live Metric Gauges (4 Cards) */}
      <div className="overview-metric-grid">
        <div className="metric-box-clean">
          <div className="metric-label">
            <span>Throughput Rate</span>
            <Gauge size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">
            {currentRps > 0 ? <>{fmt(Math.round(currentRps))} <small style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>req/s</small></> : 'No data yet'}
          </div>
          <div className="metric-sub">
            <span style={{ color: 'var(--color-lime)' }}>● Peak Performance</span>
          </div>
        </div>

        <div className="metric-box-clean">
          <div className="metric-label">
            <span>Response Time (p95)</span>
            <Clock size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">
            {p95Val !== null ? <>{p95Val.toFixed(1)} <small style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>ms</small></> : 'No data yet'}
          </div>
          <div className="metric-sub">
            <span>Critical SLA Threshold &lt; 200ms</span>
          </div>
        </div>

        <div className="metric-box-clean">
          <div className="metric-label">
            <span>Total Requests</span>
            <Activity size={15} style={{ color: 'var(--color-blue)' }} />
          </div>
          <div className="metric-value">{fmt(currentReqs)}</div>
          <div className="metric-sub">
            <span>Success: {fmt(activeRun.successCount)}</span>
          </div>
        </div>

        <div className="metric-box-clean">
          <div className="metric-label">
            <span>Error Rate</span>
            <ShieldCheck size={15} style={{ color: (activeRun.failedCount || 0) === 0 ? 'var(--color-lime)' : 'var(--color-red)' }} />
          </div>
          <div className="metric-value" style={{ color: (activeRun.failedCount || 0) === 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
            {formatErrorRate(liveMetrics.errorRate ?? activeRun.errorRate, liveMetrics.failedCount ?? activeRun.failedCount, liveMetrics.totalRequests ?? activeRun.totalRequests)}
          </div>
          <div className="metric-sub">
            <span>{formatErrorBreakdown(liveMetrics.failedCount ?? activeRun.failedCount, liveMetrics.totalRequests ?? activeRun.totalRequests, liveMetrics.errorRate ?? activeRun.errorRate)}</span>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Latency Histogram Visualizer (Phase 6.1 Bounded O(1)) */}
      <div className="dev-card" style={{ padding: '24px' }}>
        <div className="panel-header-row" style={{ marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} style={{ color: 'var(--color-blue)' }} />
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Phase 6.1 Bounded-Memory Latency Histogram Distribution
              </h3>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Fixed 6,801 buckets across 5 logarithmic tiers with exact Nearest-Rank percentiles &amp; overflow protection.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '14px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            <span>p50: <b style={{ color: 'var(--text-primary)' }}>{p50Val !== null ? `${p50Val.toFixed(1)} ms` : 'No data yet'}</b></span>
            <span>p95: <b style={{ color: 'var(--color-blue)' }}>{p95Val !== null ? `${p95Val.toFixed(1)} ms` : 'No data yet'}</b></span>
            <span>p99: <b style={{ color: 'var(--color-lime)' }}>{p99Val !== null ? `${p99Val.toFixed(1)} ms` : 'No data yet'}</b></span>
          </div>
        </div>

        {/* Histogram Bucket Visualization Bars */}
        <div style={{ display: activeRun.isDemo ? 'grid' : 'none', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginTop: '16px' }}>
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Tier 1 (&lt;10ms)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>64.2%</div>
            <div style={{ height: '4px', background: 'var(--color-blue)', borderRadius: '2px', width: '64%', marginTop: '8px' }} />
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Tier 2 (10-100ms)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-blue)', marginTop: '4px' }}>32.8%</div>
            <div style={{ height: '4px', background: 'var(--color-blue)', borderRadius: '2px', width: '33%', marginTop: '8px' }} />
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Tier 3 (100-1s)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>2.9%</div>
            <div style={{ height: '4px', background: 'var(--color-cyan)', borderRadius: '2px', width: '10%', marginTop: '8px' }} />
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Tier 4 (1-10s)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>0.1%</div>
            <div style={{ height: '4px', background: 'var(--color-amber)', borderRadius: '2px', width: '4%', marginTop: '8px' }} />
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Tier 5 (10-60s)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>0.0%</div>
            <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', width: '0%', marginTop: '8px' }} />
          </div>

          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Overflow (&gt;60s)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)', marginTop: '4px' }}>0 samples</div>
            <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', width: '0%', marginTop: '8px' }} />
          </div>
        </div>

        {/* Live Streaming Polyline Chart */}
        <div style={{ display: activeRun.isDemo ? 'block' : 'none', width: '100%', height: '140px', marginTop: '24px', position: 'relative' }}>
          <svg
            viewBox="0 0 800 130"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            <defs>
              <linearGradient id="liveStreamGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line x1="0" y1="30" x2="800" y2="30" stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2="800" y2="70" stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <line x1="0" y1="110" x2="800" y2="110" stroke="var(--border-subtle)" strokeDasharray="3 3" />

            <polygon
              points={`0,130 ${streamPoints
                .map((val, idx) => `${(idx / (streamPoints.length - 1)) * 800},${115 - val * 2.2}`)
                .join(' ')} 800,130`}
              fill="url(#liveStreamGrad)"
            />

            <polyline
              points={streamPoints
                .map((val, idx) => `${(idx / (streamPoints.length - 1)) * 800},${115 - val * 2.2}`)
                .join(' ')}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <circle
              cx="800"
              cy={115 - streamPoints[streamPoints.length - 1] * 2.2}
              r="5"
              fill="#60A5FA"
              className="pulse-dot"
            />
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          <span>-30s History Window</span>
          <span>{p95Val !== null ? `p95 latency: ${p95Val.toFixed(1)} ms` : 'No latency data yet'}</span>
        </div>
      </div>

      {/* 4. Split Two Columns: Status Codes & Live Worker Event Log */}
      <div className="overview-split-grid">
        {/* Status Codes */}
        <div className="dev-card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            HTTP Response Status Codes
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(activeRun.statusCodes || {}).length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No response data yet</span>
            ) : Object.entries(activeRun.statusCodes).map(([code, count]) => (
              <div key={code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="status-pill">{code}</span>
                <b style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {fmt(count)} ({activeRun.totalRequests > 0 ? ((count / activeRun.totalRequests) * 100).toFixed(2) : '—'}{activeRun.totalRequests > 0 ? '%' : ''})
                </b>
              </div>
            ))}
          </div>
        </div>

        {/* Live Worker Event Log (Terminal Aesthetic) */}
        <div className="dev-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} style={{ color: 'var(--color-blue)' }} />
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Worker Telemetry Log
              </h3>
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>
              ● STREAM ACTIVE
            </span>
          </div>

          <div
            style={{
              background: '#04070C',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#A1A1AA',
              height: '160px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {logs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', lineHeight: 1.4 }}>
                <span style={{ color: 'var(--color-blue)', userSelect: 'none' }}>&gt;</span>
                <span style={{ color: i === 0 ? '#F1F5F9' : '#94A3B8' }}>{log}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

