import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, Check, ChevronRight, CircleAlert, Play, Plus, RotateCcw, ShieldCheck, Square, X } from 'lucide-react';
import { BenchmarkCampaign, Target } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import './benchmark-campaigns.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const targetsForStage = [250_000, 500_000, 750_000, 1_000_000];
const fmt = (value: number) => new Intl.NumberFormat('en-US').format(value || 0);

interface Props {
  targets: Target[];
  token: string | null;
  onSignIn: () => void;
  onNotice: (message: string) => void;
}

export const BenchmarkCampaignsView: React.FC<Props> = ({ targets, token, onSignIn, onNotice }) => {
  const [campaigns, setCampaigns] = useState<BenchmarkCampaign[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [liveRun, setLiveRun] = useState<{ totalRequests: number; rps: number; status: string } | null>(null);
  const [name, setName] = useState('1M Request Benchmark Campaign');
  const [targetId, setTargetId] = useState('');
  const [path, setPath] = useState('/health');
  const [method, setMethod] = useState('GET');
  const [concurrency, setConcurrency] = useState<(number | '')[]>(['', '', '', '']);
  const [workerCount, setWorkerCount] = useState(1);
  const [timeoutMs, setTimeoutMs] = useState(5000);
  const [warmupSec, setWarmupSec] = useState(0);
  const [rampUpSec, setRampUpSec] = useState(0);
  const [maxErrorRatePercent, setMaxErrorRatePercent] = useState(0);
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [authorized, setAuthorized] = useState(false);

  const activeTargets = useMemo(() => targets.filter(target => !target.isDemo), [targets]);
  const selected = campaigns.find(campaign => campaign.id === selectedId) || campaigns[0];
  const hasActiveCampaign = selected && ['pending', 'running', 'validating', 'awaiting_approval'].includes(selected.status);

  const request = useCallback(async <T,>(route: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API}${route}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result as T;
  }, [token]);

  const refreshCampaigns = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await request<BenchmarkCampaign[]>('/campaigns');
      setCampaigns(previous => {
        if (previous.length) {
          for (const campaign of result) {
            const old = previous.find(item => item.id === campaign.id);
            const completedStage = campaign.stages.find(stage => stage.status === 'successful' && old?.stages.find(item => item.number === stage.number)?.status !== 'successful');
            if (completedStage?.report) onNotice(`Stage ${completedStage.number} completed successfully. Its report is saved and ready to open.`);
          }
        }
        return result;
      });
      setSelectedId(current => current && result.some(item => item.id === current) ? current : result[0]?.id || '');
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load campaigns.'); }
    finally { setLoading(false); }
  }, [onNotice, request, token]);

  useEffect(() => { void refreshCampaigns(); }, [refreshCampaigns]);
  useEffect(() => {
    if (!token || !selected?.currentRunId || !['running', 'validating'].includes(selected.status)) { setLiveRun(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const run = await request<{ totalRequests: number; rps: number; status: string }>(`/runs/${encodeURIComponent(selected.currentRunId!)}`);
        if (!cancelled) setLiveRun(run);
      } catch { /* Campaign state remains available if the run has been pruned or the API is reconnecting. */ }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); void refreshCampaigns(); }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [request, refreshCampaigns, selected?.currentRunId, selected?.status, token]);

  function parseHeaders() {
    const result: Record<string, string> = {};
    headersText.split('\n').forEach(line => {
      const separator = line.indexOf(':');
      if (separator > 0) result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    });
    return result;
  }

  async function createAndStart(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const created = await request<BenchmarkCampaign>('/campaigns', {
        method: 'POST', body: JSON.stringify({ name, targetId, path, method, stageConcurrency: concurrency.map(Number), workerCount, timeoutMs, warmupSec, rampUpSec, maxErrorRatePercent, headers: parseHeaders(), body: bodyText || undefined, authorized }),
      });
      setCampaigns(previous => [created, ...previous]); setSelectedId(created.id);
      const started = await request<BenchmarkCampaign>(`/campaigns/${created.id}/start`, { method: 'POST', body: '{}' });
      setCampaigns(previous => previous.map(item => item.id === started.id ? started : item));
      onNotice('Stage 1 started. Its report will be available before you approve Stage 2.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start the campaign.'); }
    finally { setSaving(false); }
  }

  async function action(actionName: 'start' | 'advance' | 'retry' | 'cancel') {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const updated = await request<BenchmarkCampaign>(`/campaigns/${selected.id}/${actionName}`, { method: 'POST', body: '{}' });
      setCampaigns(previous => previous.map(item => item.id === updated.id ? updated : item));
      onNotice(actionName === 'start' ? 'Stage 1 started.' : actionName === 'advance' ? `Stage ${updated.currentStage + 1} started.` : actionName === 'retry' ? `Retry started for Stage ${updated.currentStage + 1}.` : 'Campaign cancellation requested.');
    } catch (err) { setError(err instanceof Error ? err.message : `Could not ${actionName} the campaign.`); }
    finally { setSaving(false); }
  }

  async function downloadReport(stageNumber: number) {
    if (!selected) return;
    try {
      const report = await request<Record<string, unknown>>(`/campaigns/${selected.id}/stages/${stageNumber}/report`);
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = objectUrl; link.download = `devflow-campaign-${selected.id}-stage-${stageNumber}.json`; link.click(); URL.revokeObjectURL(objectUrl);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not download the stage report.'); }
  }

  if (!token) return <Card className="full-panel page-animate"><PanelTitle title="1M request campaigns" detail="Run four separate, quota bounded load tests with a saved report after each stage." /><div className="campaign-empty"><ShieldCheck size={28} /><p>Sign in to create an owner scoped campaign against one of your authorized targets.</p><button className="btn btn-primary" onClick={onSignIn}>Sign in</button></div></Card>;

  return <div className="campaign-layout page-animate">
    <Card className="campaign-create-panel">
      <PanelTitle title="1M request campaign" detail="Four independent runs: 250K, 500K, 750K, and 1M requests. Each stage uses a fresh worker set." />
      <div className="campaign-safety"><ShieldCheck size={16} /><span>Only saved, authorized targets are accepted. A stage must pass validation before the next can be approved.</span></div>
      {!campaigns.some(item => ['pending', 'running', 'validating', 'awaiting_approval'].includes(item.status)) && (
        <form className="campaign-form" onSubmit={createAndStart}>
          <label>Campaign name<input className="cyber-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} required /></label>
          <div className="campaign-form-grid">
            <label>Authorized target<select className="cyber-input" value={targetId} onChange={e => setTargetId(e.target.value)} required><option value="">Select target</option>{activeTargets.map(target => <option key={target.id} value={target.id}>{target.name} · {target.url}</option>)}</select></label>
            <label>Endpoint path<input className="cyber-input" value={path} onChange={e => setPath(e.target.value)} placeholder="/health" required /></label>
            <label>Method<select className="cyber-input" value={method} onChange={e => setMethod(e.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(item => <option key={item}>{item}</option>)}</select></label>
            <label>Worker processes<select className="cyber-input" value={workerCount} onChange={e => setWorkerCount(Number(e.target.value))}>{[1, 2, 4].map(item => <option key={item} value={item}>{item} workers</option>)}</select></label>
          </div>
          <div className="campaign-concurrency-list"><strong>Virtual users by stage</strong>{targetsForStage.map((requestTarget, index) => <label key={requestTarget}><span>Stage {index + 1} · {fmt(requestTarget)} requests</span><input type="number" min={workerCount} max={20} value={concurrency[index]} onChange={e => setConcurrency(previous => previous.map((value, item) => item === index ? (e.target.value ? Number(e.target.value) : '') : value))} /></label>)}</div>
          <div className="campaign-form-grid campaign-form-grid-small">
            <label>Request timeout (ms)<input className="cyber-input" type="number" min={500} max={10000} step={500} value={timeoutMs} onChange={e => setTimeoutMs(Number(e.target.value))} /></label>
            <label>Warm-up (seconds)<input className="cyber-input" type="number" min={0} max={300} value={warmupSec} onChange={e => setWarmupSec(Number(e.target.value))} /></label>
            <label>Ramp-up (seconds)<input className="cyber-input" type="number" min={0} max={300} value={rampUpSec} onChange={e => setRampUpSec(Number(e.target.value))} /></label>
            <label>Maximum error rate (%)<input className="cyber-input" type="number" min={0} max={100} step="0.1" value={maxErrorRatePercent} onChange={e => setMaxErrorRatePercent(Number(e.target.value))} /></label>
          </div>
          <details className="campaign-advanced"><summary>Request headers and body</summary><label>Headers, one per line<textarea className="cyber-input" rows={3} value={headersText} onChange={e => setHeadersText(e.target.value)} placeholder="Authorization: Bearer …" /></label>{['POST', 'PUT', 'PATCH'].includes(method) && <label>Request body<textarea className="cyber-input" rows={3} value={bodyText} onChange={e => setBodyText(e.target.value)} /></label>}</details>
          <label className="campaign-authorize"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} /> I have permission to generate this traffic against the selected target.</label>
          <button className="btn btn-primary" type="submit" disabled={saving || !targetId || !authorized}><Play size={15} />{saving ? 'Starting…' : 'Create campaign and start Stage 1'}</button>
        </form>
      )}
      {error && <p className="campaign-error" role="alert"><CircleAlert size={15} />{error}</p>}
      {campaigns.length > 0 && <div className="campaign-history"><strong>Saved campaigns</strong>{campaigns.map(item => <button key={item.id} className={item.id === selected?.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}><span>{item.name}</span><small>{item.status.replaceAll('_', ' ')}</small></button>)}</div>}
      {loading && <p className="campaign-muted">Refreshing saved campaigns…</p>}
    </Card>

    <Card className="campaign-progress-panel">
      <PanelTitle title={selected?.name || 'Campaign stages'} detail={selected ? `${selected.targetName} · ${selected.method} ${selected.path} · ${selected.workerCount} workers` : 'Create a campaign to see its stages and reports.'} />
      {!selected ? <div className="campaign-empty"><Activity size={26} /><p>Choose a saved authorized target, configure concurrency, and start Stage 1.</p></div> : <>
        <div className="campaign-status-line"><span className={`campaign-status-dot ${selected.status}`} />{selected.status.replaceAll('_', ' ')}{selected.error && <span className="campaign-error-text">{selected.error}</span>}</div>
        {hasActiveCampaign && selected.currentRunId && <div className="campaign-live"><Activity size={15} /><span>Stage {selected.currentStage + 1}</span><strong>{fmt(liveRun?.totalRequests || 0)} requests</strong><small>{(liveRun?.rps || 0).toFixed(1)} req/s · {liveRun?.status || selected.status}</small></div>}
        <ol className="campaign-stage-list">{selected.stages.map(stage => <li key={stage.number} className={`campaign-stage ${stage.status}`}>
          <span className="campaign-stage-marker">{stage.status === 'successful' ? <Check size={15} /> : stage.status === 'failed' || stage.status === 'completed_with_errors' ? <X size={15} /> : stage.number}</span>
          <div className="campaign-stage-content"><div className="campaign-stage-title"><strong>Stage {stage.number}</strong><span>{stage.status.replaceAll('_', ' ')}</span></div><p>{fmt(stage.requestTarget)} requests · {stage.concurrency} VUs · {stage.runIds.length} attempt{stage.runIds.length === 1 ? '' : 's'}</p>{stage.report && <div className="campaign-stage-metrics"><span>{fmt(stage.report.performance.actualRequests ?? stage.report.campaign.actualRequests)} requests completed</span><span>{Number(stage.report.performance.rps || 0).toFixed(1)} req/s</span><span>p95 {Number(stage.report.performance.p95 || 0).toFixed(2)} ms</span></div>}{stage.error && <small className="campaign-error-text">{stage.error}</small>}</div>
          {stage.report && <button className="btn btn-secondary btn-sm campaign-report-button" onClick={() => void downloadReport(stage.number)} title={`Download Stage ${stage.number} JSON report`}><ArrowDownToLine size={14} /> Report</button>}
        </li>)}</ol>
        <div className="campaign-actions">
          {selected.status === 'pending' && <button className="btn btn-primary" disabled={saving} onClick={() => void action('start')}><Play size={14} />Start campaign</button>}
          {selected.status === 'awaiting_approval' && <button className="btn btn-primary" disabled={saving} onClick={() => void action('advance')}><ChevronRight size={15} />Approve Stage {selected.currentStage + 2}</button>}
          {selected.stages[selected.currentStage]?.status && ['failed', 'cancelled', 'completed_with_errors'].includes(selected.stages[selected.currentStage].status) && <button className="btn btn-secondary" disabled={saving} onClick={() => void action('retry')}><RotateCcw size={14} />Retry Stage {selected.currentStage + 1}</button>}
          {hasActiveCampaign && <button className="btn btn-danger" disabled={saving} onClick={() => void action('cancel')}><Square size={14} />Cancel campaign</button>}
        </div>
      </>}
    </Card>
  </div>;
};
