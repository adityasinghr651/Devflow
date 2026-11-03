import React, { useMemo, useState } from 'react';
import { ArrowDownRight, GitBranch } from 'lucide-react';
import { Run } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface ComparisonsViewProps { completed: Run[]; }

export const ComparisonsView: React.FC<ComparisonsViewProps> = ({ completed }) => {
  const ordered = useMemo(() => [...completed].sort((x, y) => Date.parse(y.finishedAt || y.startedAt) - Date.parse(x.finishedAt || x.startedAt)), [completed]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const a = ordered.find((r) => r.id === aId) || ordered[0];
  const b = ordered.find((r) => r.id === bId) || ordered[1];
  const comparable = !!a && !!b && a.targetId === b.targetId && a.method === b.method && a.url === b.url && a.concurrency === b.concurrency && a.durationSec === b.durationSec && a.profile === b.profile;
  const delta = (x: number, y: number) => `${x - y >= 0 ? '+' : ''}${(x - y).toFixed(2)}`;
  const runLabel = (r: Run) => `${r.targetName} · ${new Date(r.finishedAt || r.startedAt).toLocaleString()} · ${r.id.slice(0, 8)}`;

  return <Card className="full-panel page-animate">
    <PanelTitle title="Compare test runs" detail="Choose two completed runs and compare their measured results." />
    {ordered.length < 2 ? <EmptyState icon={GitBranch} title="Two completed runs required" body="Complete at least two tests to compare measured throughput, p95 latency, and error rate." /> : <>
      <div className="compare-selectors">
        <label>Run A<select className="dev-select" value={a?.id || ''} onChange={(e) => setAId(e.target.value)}>{ordered.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</select></label>
        <label>Run B<select className="dev-select" value={b?.id || ''} onChange={(e) => setBId(e.target.value)}>{ordered.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</select></label>
      </div>
      {!comparable && <div className="compare-warning" role="status">These runs use different target or workload settings. Compare the values as separate observations, not a controlled regression check.</div>}
      <div className="compare-grid">
        {[
          { label: 'Throughput', a: a.rps, b: b.rps, unit: 'req/s' },
          { label: 'p95 latency', a: a.p95, b: b.p95, unit: 'ms' },
          { label: 'Error rate', a: a.errorRate, b: b.errorRate, unit: '%' },
        ].map((m) => <div className="compare-card" key={m.label}>
          <span>{m.label}</span>
          <div className="compare-values"><b>{m.a.toFixed(m.unit === '%' ? 4 : 1)} {m.unit}</b><ArrowDownRight size={15} /><b>{m.b.toFixed(m.unit === '%' ? 4 : 1)} {m.unit}</b></div>
          <small>Run A − Run B: <strong>{delta(m.a, m.b)} {m.unit}</strong></small>
        </div>)}
      </div>
    </>}
  </Card>;
};
