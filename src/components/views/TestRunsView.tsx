import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Clock,
  Gauge,
  Play,
  Plus,
  Radio,
  Search,
  Square,
  X,
} from 'lucide-react';
import { Run } from '../../types/index.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';

interface TestRunsViewProps {
  runs: Run[];
  query: string;
  setQuery: (q: string) => void;
  visibleRuns: Run[];
  onSelectRun: (run: Run) => void;
  onStopRun: (id: string) => void;
  onCreateTestClick: () => void;
  fmt: (n: number) => string;
}

export const TestRunsView: React.FC<TestRunsViewProps> = ({
  runs,
  query,
  setQuery,
  visibleRuns,
  onSelectRun,
  onStopRun,
  onCreateTestClick,
  fmt,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  const runningCount = runs.filter((r) => ['running', 'queued', 'validating'].includes(r.status)).length;
  const completedCount = runs.filter((r) => r.status === 'completed').length;
  const failedCount = runs.filter((r) => ['failed', 'timed_out', 'cancelled'].includes(r.status)).length;

  const filteredRuns = visibleRuns.filter((r) => {
    if (statusFilter === 'running') return ['running', 'queued', 'validating'].includes(r.status);
    if (statusFilter === 'completed') return r.status === 'completed';
    if (statusFilter === 'failed') return ['failed', 'timed_out', 'cancelled'].includes(r.status);
    return true;
  });

  return (
    <div className="dev-card page-animate" style={{ padding: '24px' }}>
      {/* Header Row */}
      <div className="panel-header-row" style={{ marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Load Test Executions
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {runs.length} test executions recorded • Bounded-memory telemetry &amp; SSE streaming
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onCreateTestClick}
          >
            <Plus size={14} />
            <span>Create Test</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Runs ({runs.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'running' ? 'active' : ''}`}
            onClick={() => setStatusFilter('running')}
          >
            <i className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-blue)', display: 'inline-block', marginRight: 6 }} />
            Active ({runningCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            Completed ({completedCount})
          </button>
          {failedCount > 0 && (
            <button
              type="button"
              className={`filter-tab ${statusFilter === 'failed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('failed')}
            >
              Failed ({failedCount})
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="search-box-clean">
          <Search size={14} style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by target, URL, status…"
            className="dev-input"
            style={{ width: '240px', padding: '7px 12px 7px 32px', fontSize: '12px' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="empty-state-clean">
          <Activity size={32} style={{ color: 'var(--text-dim)' }} />
          <h4>No matching test executions</h4>
          <p>Launch a load test to generate durable latency profiles and telemetry records.</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onCreateTestClick}
          >
            <Plus size={14} />
            <span>Create Test</span>
          </button>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Target Endpoint</th>
                <th>Workload Profile</th>
                <th>Status</th>
                <th>Total Requests</th>
                <th>Throughput</th>
                <th>p95 Latency</th>
                <th>Error Rate</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((r) => {
                const isRunning = ['running', 'queued', 'validating'].includes(r.status);
                const methodColor =
                  r.method === 'GET'
                    ? '#3B82F6'
                    : r.method === 'POST'
                    ? '#10B981'
                    : r.method === 'PUT'
                    ? '#F59E0B'
                    : '#EF4444';

                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelectRun(r)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                    className="table-row-hover"
                  >
                    <td>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              background: `${methodColor}20`,
                              color: methodColor,
                              border: `1px solid ${methodColor}40`,
                            }}
                          >
                            {r.method || 'GET'}
                          </span>
                          <b style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                            {r.targetName}
                          </b>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {r.url}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="env-pill">
                        {r.profile === 'stages' ? 'Staged Ramp-Up' : `${r.concurrency} VUs · ${r.durationSec}s`}
                      </span>
                    </td>

                    <td>
                      <StatusBadge status={r.status} />
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
                      {fmt(r.totalRequests)}
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-blue)' }}>
                      {r.rps ? `${r.rps.toFixed(1)} req/s` : '—'}
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
                      {r.p95 ? `${r.p95.toFixed(1)} ms` : '—'}
                    </td>

                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: r.errorRate > 0 ? 'var(--color-red)' : 'var(--color-lime)' }}>
                        {r.errorRate !== undefined ? `${(r.errorRate * 100).toFixed(2)}%` : '0.00%'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        {isRunning ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStopRun(r.id);
                            }}
                          >
                            <Square size={12} fill="currentColor" />
                            <span>Stop</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRun(r);
                            }}
                          >
                            <span>Inspect</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
