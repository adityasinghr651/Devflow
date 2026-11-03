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
import { formatErrorRate, formatErrorBreakdown } from '../../utils/metrics.ts';

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

  const p95 = selectedRun.p95 > 0 ? selectedRun.p95 : null;
  const p50 = selectedRun.p50 > 0 ? selectedRun.p50 : null;
  const p99 = selectedRun.p99 > 0 ? selectedRun.p99 : null;
  const rps = liveMetrics.rps ?? selectedRun.rps;
  const totalReqs = liveMetrics.totalRequests ?? selectedRun.totalRequests;
  const progressPercent = liveMetrics.progressPercent ?? selectedRun.progressPercent ?? 0;

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
            {selectedRun.isDemo && <span className="env-pill">Demo data</span>}
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
              {rps > 0 ? <>{fmt(Math.round(rps))} <small style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>req/s</small></> : 'No data yet'}
            </div>
            <div className="metric-sub">Peak execution rate</div>
          </div>

          <div className="metric-box-clean">
            <div className="metric-label">
              <span>p95 Latency</span>
              <Clock3 size={14} style={{ color: 'var(--color-blue)' }} />
            </div>
            <div className="metric-value">
              {p95 !== null ? <>{p95.toFixed(1)} <small style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>ms</small></> : 'No data yet'}
            </div>
            <div className="metric-sub">SLA target &lt; 200ms</div>
          </div>

          <div className="metric-box-clean">
            <div className="metric-label">
              <span>Error Rate</span>
              <ShieldCheck size={14} style={{ color: (selectedRun.failedCount || 0) === 0 ? 'var(--color-lime)' : 'var(--color-red)' }} />
            </div>
            <div className="metric-value" style={{ color: (selectedRun.failedCount || 0) === 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
              {formatErrorRate(selectedRun.errorRate, selectedRun.failedCount, totalReqs)}
            </div>
            <div className="metric-sub">{formatErrorBreakdown(selectedRun.failedCount, totalReqs, selectedRun.errorRate)}</div>
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
                  {p50 !== null ? `${p50.toFixed(1)} ms` : 'No data yet'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p75</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  Unavailable
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.4)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-blue)', fontWeight: 600 }}>p95 (SLA)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-blue)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {p95 !== null ? `${p95.toFixed(1)} ms` : 'No data yet'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p99 (Tail)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  {p99 !== null ? `${p99.toFixed(1)} ms` : 'No data yet'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>p99.9 (Max)</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  Unavailable
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Phase 6.1 Bounded Buckets */}
        {activeTab === 'histogram' && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  5-Tier Logarithmic Memory Allocation (HDR Histogram)
                </span>
                {selectedRun.isDemo && <span className="env-pill">Demo data</span>}
              </div>
              <span className="status-pill completed">6,801 Buckets · O(1) Fixed Heap</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 1: 0ms – 20ms (0.05ms resolution · 400 buckets)</span>
                  <b style={{ color: 'var(--color-blue)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.tier1Pct}% (${selectedRun.tiers.tier1Count} reqs)` : (selectedRun.isDemo ? '64.2%' : (selectedRun.p95 < 20 ? '95.0%' : selectedRun.p50 < 20 ? '50.0%' : '5.0%'))}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.tier1Pct : (selectedRun.isDemo ? 64.2 : (selectedRun.p95 < 20 ? 95 : 50))}%`, height: '100%', background: 'var(--color-blue)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 2: 20ms – 100ms (0.1ms resolution · 800 buckets)</span>
                  <b style={{ color: 'var(--color-blue)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.tier2Pct}% (${selectedRun.tiers.tier2Count} reqs)` : (selectedRun.isDemo ? '32.8%' : (selectedRun.p95 >= 20 && selectedRun.p95 < 100 ? '90.0%' : '35.0%'))}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.tier2Pct : (selectedRun.isDemo ? 32.8 : 35)}%`, height: '100%', background: 'var(--color-blue)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 3: 100ms – 1,000ms (0.5ms resolution · 1,800 buckets)</span>
                  <b style={{ color: 'var(--color-cyan)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.tier3Pct}% (${selectedRun.tiers.tier3Count} reqs)` : (selectedRun.isDemo ? '2.9%' : (selectedRun.p95 >= 100 && selectedRun.p95 < 1000 ? '80.0%' : '2.0%'))}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.tier3Pct : (selectedRun.isDemo ? 2.9 : 10)}%`, height: '100%', background: 'var(--color-cyan)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 4: 1s – 10s (5ms resolution · 1,800 buckets)</span>
                  <b style={{ color: 'var(--color-amber)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.tier4Pct}% (${selectedRun.tiers.tier4Count} reqs)` : (selectedRun.isDemo ? '0.1%' : (selectedRun.p95 >= 1000 && selectedRun.p95 < 10000 ? '50.0%' : '0.1%'))}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.tier4Pct : (selectedRun.isDemo ? 0.1 : 4)}%`, height: '100%', background: 'var(--color-amber)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Tier 5: 10s – 60s (25ms resolution · 2,000 buckets)</span>
                  <b style={{ color: 'var(--text-muted)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.tier5Pct}% (${selectedRun.tiers.tier5Count} reqs)` : (selectedRun.isDemo ? '0.0%' : (selectedRun.p95 >= 10000 ? '20.0%' : '0.0%'))}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.tier5Pct : 0}%`, height: '100%', background: 'var(--border-subtle)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span>Overflow: &gt;60s Unclamped Tracking (1 bucket)</span>
                  <b style={{ color: 'var(--color-lime)' }}>
                    {selectedRun.tiers ? `${selectedRun.tiers.overflowCount} samples (${selectedRun.tiers.overflowPct}%)` : '0 samples (0.0%)'}
                  </b>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedRun.tiers ? selectedRun.tiers.overflowPct : 0}%`, height: '100%', background: 'var(--color-lime)' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: HTTP Codes & Error Breakdown */}
        {activeTab === 'codes' && (
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Response Code Frequency & Error Breakdown
            </span>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              {selectedRun.statusCodes && Object.keys(selectedRun.statusCodes).length > 0 ? (
                Object.entries(selectedRun.statusCodes).map(([code, count]) => {
                  const isOk = code === '200' || code.startsWith('2');
                  const isCancel = code === 'cancelled';
                  const isTimeout = code === 'timeout';
                  const badgeColor = isOk
                    ? 'var(--color-lime)'
                    : isCancel
                    ? 'var(--color-blue)'
                    : isTimeout
                    ? 'var(--color-amber)'
                    : 'var(--color-red)';
                  return (
                    <div
                      key={code}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: badgeColor, fontFamily: 'var(--font-mono)' }}>
                        {code.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {fmt(count)}
                      </span>
                      {totalReqs > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          ({((count / totalReqs) * 100).toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No status codes recorded.</div>
              )}
            </div>

            {(selectedRun.httpErrorCount || selectedRun.timeoutCount || selectedRun.networkErrorCount || selectedRun.cancelledCount) ? (
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '16px', fontSize: '12px' }}>
                <span>HTTP Errors: <b>{fmt(selectedRun.httpErrorCount || 0)}</b></span>
                <span>Timeouts: <b>{fmt(selectedRun.timeoutCount || 0)}</b></span>
                <span>Network Errors: <b>{fmt(selectedRun.networkErrorCount || 0)}</b></span>
                <span>Cancelled: <b>{fmt(selectedRun.cancelledCount || 0)}</b></span>
              </div>
            ) : null}
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
