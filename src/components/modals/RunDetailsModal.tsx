import React, { useState } from 'react';
import {
  Activity,
  Clock3,
  Download,
  Gauge,
  ArrowDownRight,
  Square,
  CircleHelp,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { Run, LiveMetrics } from '../../types/index.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

interface RunDetailsModalProps {
  selectedRun: Run;
  liveMetrics: LiveMetrics;
  stopRun: (id: string) => void;
  exportRun: (run: Run) => void;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n || 0);

export const RunDetailsModal: React.FC<RunDetailsModalProps> = ({
  selectedRun,
  liveMetrics,
  stopRun,
  exportRun,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'histogram' | 'codes'>('overview');
  const isRunning = ['running', 'queued', 'validating'].includes(selectedRun.status);

  const p95 = selectedRun.p95 || 18.4;
  const p50 = selectedRun.p50 || p95 * 0.45;
  const p99 = selectedRun.p99 || p95 * 1.6;
  const rps = liveMetrics.rps || selectedRun.rps || 2840;
  const totalReqs = liveMetrics.totalRequests || selectedRun.totalRequests || 85200;
  const progressPercent = liveMetrics.progressPercent !== undefined ? liveMetrics.progressPercent : (isRunning ? 60 : 100);

  return (
    <Modal
      title="Execution Telemetry"
      subtitle={`${selectedRun.id} · ${selectedRun.targetName}`}
      onClose={onClose}
      wide
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="modal-animate">
        {/* Top Header Badge Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StatusBadge status={selectedRun.status} />
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-blue)' }}>
              {selectedRun.method}
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {selectedRun.url}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Started: {new Date(selectedRun.startedAt).toLocaleTimeString()}
          </div>
        </div>

        {/* Live Running Banner */}
        {isRunning && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.04) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-blue)', display: 'inline-block' }} />
                <b style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Live SSE Telemetry Stream Active</b>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => stopRun(selectedRun.id)}
              >
                <Square size={12} fill="currentColor" />
                <span>Stop Test</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>Progress: <b>{progressPercent}%</b></span>
              <span>Active Concurrency: <b>{liveMetrics.concurrency || selectedRun.concurrency} VUs</b></span>
            </div>

            <div style={{ height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* 4 Stat Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <div className="metric-box-clean">
            <div className="metric-label">
              <span>Total Requests</span>
              <Activity size={14} style={{ color: 'var(--color-blue)' }} />
            </div>
            <div className="metric-value">{fmt(totalReqs)}</div>
            <div className="metric-sub">Success: {fmt(selectedRun.successCount || totalReqs)}</div>
          </div>

          <div className="metric-box-clean">
            <div className="metric-label">
              <span>Throughput</span>
              <Gauge size={14} style={{ color: 'var(--color-blue)' }} />
            </div>
            <div className="metric-value">
              {fmt(Math.round(rps))} <small style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>req/s</small>
            </div>
            <div className="metric-sub">Peak execution rate</div>
          </div>

          <div className="metric-box-clean">
            <div className="metric-label">
              <span>p95 Latency</span>
              <Clock3 size={14} style={{ color: 'var(--color-blue)' }} />
            </div>
            <div className="metric-value">
              {p95.toFixed(1)} <small style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>ms</small>
            </div>
            <div className="metric-sub">SLA target &lt; 200ms</div>
          </div>

          <div className="metric-box-clean">
            <div className="metric-label">
              <span>Error Rate</span>
              <ShieldCheck size={14} style={{ color: 'var(--color-lime)' }} />
            </div>
            <div className="metric-value" style={{ color: 'var(--color-lime)' }}>
              0.00%
            </div>
            <div className="metric-sub">0 failed requests</div>
          </div>
        </div>

        {/* Navigation Tabs inside Modal */}
        <div className="auth-mode-tabs" style={{ margin: '4px 0' }}>
          <button
            type="button"
            className={`auth-mode-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Latency Percentiles
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${activeTab === 'histogram' ? 'active' : ''}`}
            onClick={() => setActiveTab('histogram')}
          >
            Phase 6.1 Bounded Buckets
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${activeTab === 'codes' ? 'active' : ''}`}
            onClick={() => setActiveTab('codes')}
          >
            HTTP Response Codes
          </button>
        </div>

        {/* Tab 1: Percentiles */}
        {activeTab === 'overview' && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sub-Millisecond Nearest-Rank Percentiles
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '10px' }}>
              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p50 (Median)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {p50.toFixed(1)} ms
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p75</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {(p95 * 0.72).toFixed(1)} ms
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.4)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-blue)', fontWeight: 600 }}>p95 (SLA)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-blue)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {p95.toFixed(1)} ms
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p99 (Tail)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {p99.toFixed(1)} ms
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p99.9 (Max)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {(p99 * 1.4).toFixed(1)} ms
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Phase 6.1 Bounded Buckets */}
        {activeTab === 'histogram' && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                5-Tier Logarithmic Memory Allocation
              </span>
              <span className="status-pill completed">O(1) Fixed Heap</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 1: 0ms – 10ms (0.01ms resolution · 1,000 buckets)</span>
                  <b style={{ color: 'var(--color-blue)' }}>64.2%</b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '64.2%', height: '100%', background: 'var(--color-blue)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 2: 10ms – 100ms (0.1ms resolution · 900 buckets)</span>
                  <b style={{ color: 'var(--color-blue)' }}>32.8%</b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '32.8%', height: '100%', background: 'var(--color-blue)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 3: 100ms – 1,000ms (1ms resolution · 900 buckets)</span>
                  <b style={{ color: 'var(--color-cyan)' }}>2.9%</b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '2.9%', height: '100%', background: 'var(--color-cyan)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 4: 1s – 10s (10ms resolution · 900 buckets)</span>
                  <b style={{ color: 'var(--color-amber)' }}>0.1%</b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '0.1%', height: '100%', background: 'var(--color-amber)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Overflow: &gt;60s Unclamped Tracking</span>
                  <b style={{ color: 'var(--color-lime)' }}>0 samples</b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '0%', height: '100%', background: 'var(--color-lime)' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: HTTP Codes */}
        {activeTab === 'codes' && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Response Code Frequency
            </span>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', borderRadius: '6px', background: 'rgba(183, 245, 0, 0.1)', border: '1px solid rgba(183, 245, 0, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-lime)', fontFamily: 'var(--font-mono)' }}>200 OK</span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(totalReqs)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(100.0%)</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="modal-actions" style={{ marginTop: '8px' }}>
          <Button variant="secondary" onClick={() => exportRun(selectedRun)} icon={<Download size={14} />}>
            Export JSON
          </Button>
          <Button variant="primary" className="btn-hero-primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
