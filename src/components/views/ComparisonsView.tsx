import React, { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Run, RunRegression } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface ComparisonsViewProps { completed: Run[]; token: string | null; hasMore?: boolean; onLoadMore?: () => void; }
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '').replace(/\/v1$/, '');
const metricMeta = [
  { key: 'rps', label: 'Throughput', unit: 'req/s', digits: 2 },
  { key: 'p95', label: 'p95 latency', unit: 'ms', digits: 2 },
  { key: 'p99', label: 'p99 latency', unit: 'ms', digits: 2 },
  { key: 'errorRate', label: 'Error rate', unit: '%', digits: 4 },
] as const;

export const ComparisonsView: React.FC<ComparisonsViewProps> = ({ completed, token, hasMore = false, onLoadMore }) => {
  const latest = completed[0];
  const [report, setReport] = useState<RunRegression | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!latest || !token) { setReport(null); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`${API}/v1/runs/${encodeURIComponent(latest.id)}/regression`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not load regression verdict (${response.status}).`);
      return body as RunRegression;
    }).then(setReport).catch(err => {
      if (err.name !== 'AbortError') setError(err.message || 'Could not load regression verdict.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [latest?.id, token]);

  const colorFor = (verdict?: string) => verdict === 'regression'
    ? 'var(--color-red)' : verdict === 'improvement' || verdict === 'pass'
      ? 'var(--color-green)' : 'var(--text-secondary)';

  return (
    <Card className="full-panel page-animate">
      <PanelTitle
        title="Statistical run comparison"
        detail="Compare a completed run with its five most recent matching workloads using robust median and MAD bands."
      />

      {!latest ? (
        <EmptyState icon={GitBranch} title="No completed runs yet" body="Run a workload to start building a comparable baseline." />
      ) : (
        <div className="regression-comparison">
          <div className="regression-run-meta">
            <div><strong>Latest run</strong><span>{latest.targetName} · {latest.method} {new URL(latest.url).pathname} · {latest.concurrency} VUs · {latest.durationSec}s</span></div>
            <code title={latest.id}>{latest.id.slice(0, 8)}</code>
          </div>
          {!token && <p className="compare-warning" role="status">Sign in to calculate a private, owner-scoped regression verdict.</p>}
          {loading && <p className="compare-note" role="status">Loading comparable history…</p>}
          {error && <p className="compare-warning" role="alert">{error}</p>}
          {report && (
            <>
              <section className="regression-verdict" aria-live="polite">
                <span>Verdict</span>
                <strong style={{ color: colorFor(report.verdict) }}>{report.verdict.replace('_', ' ').toUpperCase()}</strong>
                <small>{report.baselineCount} of {report.minimumBaselineRuns} minimum comparable runs · fingerprint {report.fingerprint.slice(0, 12)}</small>
              </section>
              {report.verdict === 'insufficient_data' && (
                <p className="compare-warning" role="status">{report.reason} Comparisons require the same target and workload settings.</p>
              )}
              <div className="regression-metric-grid">
                {metricMeta.map(meta => {
                  const metric = report.metrics[meta.key];
                  return (
                    <div className="regression-metric-card" key={meta.key}>
                      <span>{meta.label}</span>
                      <strong style={{ color: colorFor(metric.verdict) }}>{metric.observed.toFixed(meta.digits)} {meta.unit}</strong>
                      {metric.band ? (
                        <small>Decision band: {metric.band.lower.toFixed(meta.digits)}–{metric.band.upper.toFixed(meta.digits)} {meta.unit} · baseline median {metric.median?.toFixed(meta.digits)}</small>
                      ) : <small>Baseline band unavailable until enough matching runs exist.</small>}
                      <small className="regression-metric-status">{metric.verdict.replace('_', ' ')}</small>
                    </div>
                  );
                })}
              </div>
              {report.baselineRunIds.length > 0 && <p className="compare-note">Baseline runs: {report.baselineRunIds.map(id => id.slice(0, 8)).join(', ')}. {report.reason}</p>}
            </>
          )}
        </div>
      )}
      {hasMore && <div style={{ display:'flex', justifyContent:'center', padding:16 }}><button type="button" className="btn btn-secondary btn-sm" onClick={onLoadMore}>Load older comparison history</button></div>}
    </Card>
  );
};
