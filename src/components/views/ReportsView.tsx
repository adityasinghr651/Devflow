import React from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Run } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Button } from '../ui/Button.tsx';

interface ReportsViewProps {
  completed: Run[];
  exportRun: (run: Run) => void;
  fmt: (n: number) => string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ completed, exportRun, fmt }) => {
  return (
    <Card className="full-panel page-animate">
      <PanelTitle
        title="Exportable Benchmark Reports"
        detail="Download durable JSON snapshots of full test telemetry and execution configurations."
      />

      {completed.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Reports will appear here"
          body="Complete a performance test to export its measured metrics, percentiles, and configuration as JSON."
        />
      ) : (
        <div className="report-grid">
          {completed.map((r) => (
            <div className="report-card" key={r.id}>
              <div className="report-card-top">
                <div className="target-symbol">
                  <BarChart3 size={16} />
                </div>
                <StatusBadge status={r.status} />
              </div>
              <b style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{r.targetName}</b>
              <span className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                {r.id}
              </span>
              <div className="report-stats">
                <span>
                  <small>Total Requests</small>
                  <b>{fmt(r.totalRequests)}</b>
                </span>
                <span>
                  <small>p95 Latency</small>
                  <b>{r.p95.toFixed(1)} ms</b>
                </span>
                <span>
                  <small>Error Rate</small>
                  <b>{r.errorRate.toFixed(2)}%</b>
                </span>
              </div>
              <Button
                variant="secondary"
                className="full-button"
                onClick={() => exportRun(r)}
                icon={<Download size={14} />}
              >
                Export JSON Snapshot
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

