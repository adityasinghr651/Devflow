import React from 'react';
import { Activity, Gauge } from 'lucide-react';
import { Run } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { formatErrorRate, formatErrorBreakdown } from '../../utils/metrics.ts';

interface AnalysisViewProps {
  completed: Run[];
  fmt: (n: number) => string;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ completed, fmt }) => {
  return (
    <Card className="full-panel page-animate">
      <PanelTitle
        title="Performance Analysis & Diagnostic Findings"
        detail="Deterministic observations derived strictly from measured latency percentiles, error rates, and throughput."
      />

      {completed.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No measurements to analyze"
          body="Complete a test run first. Analysis evaluates measured throughput, latency percentiles, and HTTP error distributions."
        />
      ) : (
        <div className="findings">
          {completed.slice(0, 10).map((r) => {
            const hasHighError = r.errorRate > 1;
            const hasHighLatency = r.p95 > 500;
            const isDegraded = hasHighError || hasHighLatency;

            return (
              <div className="finding" key={r.id}>
                <div
                  className={`finding-icon ${isDegraded ? 'warning' : ''}`}
                  style={{
                    background: isDegraded ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-lime-bg)',
                    color: isDegraded ? 'var(--color-amber)' : 'var(--color-lime)',
                  }}
                >
                  <Activity size={17} />
                </div>
                <div>
                  <b style={{ color: 'var(--text-primary)' }}>
                    {r.targetName} · {r.id.slice(0, 8)} ({r.profile === 'stages' ? 'Staged Workload' : 'Fixed Concurrency'})
                  </b>
                  <p>
                    {hasHighError
                      ? `Observed ${formatErrorBreakdown(r.failedCount, r.totalRequests, r.errorRate)}. Inspect response codes and server error logs during this active load interval.`
                      : hasHighLatency
                      ? `p95 latency reached ${r.p95.toFixed(1)} ms. Verify downstream database bottlenecks and thread pool saturation before inferring root cause.`
                      : `Target demonstrated consistent performance with p95 latency of ${r.p95.toFixed(1)} ms and ${formatErrorRate(r.errorRate, r.failedCount, r.totalRequests)} errors (${(r.failedCount || 0).toLocaleString()} failed). Retain as reference baseline.`}
                  </p>
                  <span className="finding-evidence">
                    Evidence: {fmt(r.totalRequests)} requests · {r.rps.toFixed(1)} req/s · p50 {r.p50.toFixed(1)} ms · p99 {r.p99.toFixed(1)} ms
                  </span>
                </div>
                <StatusBadge status={isDegraded ? 'warning' : 'completed'} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

