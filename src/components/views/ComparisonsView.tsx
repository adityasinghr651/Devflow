import React from 'react';
import { ArrowDownRight, GitBranch } from 'lucide-react';
import { Run } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface ComparisonsViewProps {
  completed: Run[];
}

export const ComparisonsView: React.FC<ComparisonsViewProps> = ({ completed }) => {
  const a = completed[0];
  const b = completed[1];
  const delta = (x: number, y: number) => `${x >= y ? '+' : ''}${(x - y).toFixed(1)}`;

  return (
    <Card className="full-panel page-animate">
      <PanelTitle
        title="Comparative Telemetry Analysis"
        detail="Compare consecutive runs to detect throughput regressions and tail latency shifts."
      />

      {completed.length < 2 ? (
        <EmptyState
          icon={GitBranch}
          title="Two completed runs required"
          body="Execute the workload against the same target more than once to compare throughput, p95 latency, and error rates."
        />
      ) : (
        <div className="compare-grid">
          {[
            { label: 'Throughput', a: a.rps, b: b.rps, unit: 'req/s', invert: false },
            { label: 'p95 Latency', a: a.p95, b: b.p95, unit: 'ms', invert: true },
            { label: 'Error Rate', a: a.errorRate, b: b.errorRate, unit: '%', invert: true },
          ].map((m) => {
            const diff = m.a - m.b;
            const isGood = m.invert ? diff <= 0 : diff >= 0;
            return (
              <div className="compare-card" key={m.label}>
                <span>{m.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                  <b style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    {m.a.toFixed(1)} {m.unit}
                  </b>
                  <ArrowDownRight
                    size={15}
                    style={{
                      color: isGood ? 'var(--color-green)' : 'var(--color-red)',
                      transform: diff >= 0 ? 'rotate(-45deg)' : 'none',
                    }}
                  />
                  <b style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {m.b.toFixed(1)} {m.unit}
                  </b>
                </div>
                <small style={{ color: 'var(--text-dim)' }}>
                  Latest vs Previous:{' '}
                  <span style={{ color: isGood ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 600 }}>
                    {delta(m.a, m.b)} {m.unit}
                  </span>
                </small>
              </div>
            );
          })}
          <p className="compare-note">
            Comparisons are ordered by the two most recently completed test runs. Verify that target endpoint, environment, hardware, concurrency, and duration parameters are identical before drawing conclusions.
          </p>
        </div>
      )}
    </Card>
  );
};

