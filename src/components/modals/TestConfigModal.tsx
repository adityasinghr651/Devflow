import React, { useState } from 'react';
import { Layers, Play, Zap, X, ShieldCheck, Clock, Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { Target, Stage } from '../../types/index.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface TestConfigModalProps {
  targets: Target[];
  onAddTarget: () => void;
  testTarget: string;
  setTestTarget: (val: string) => void;
  path: string;
  setPath: (val: string) => void;
  method: string;
  setMethod: (val: string) => void;
  concurrency: number;
  setConcurrency: (val: number) => void;
  duration: number;
  setDuration: (val: number) => void;
  testProfile: 'fixed' | 'stages';
  setTestProfile: (val: 'fixed' | 'stages') => void;
  stages: Stage[];
  setStages: (val: Stage[]) => void;
  headersText: string;
  setHeadersText: (val: string) => void;
  bodyText: string;
  setBodyText: (val: string) => void;
  timeoutMs: number;
  setTimeoutMs: (val: number) => void;
  authorized: boolean;
  setAuthorized: (val: boolean) => void;
  starting: boolean;
  error: string;
  canRun: boolean;
  launchTest: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const TestConfigModal: React.FC<TestConfigModalProps> = ({
  targets,
  onAddTarget,
  testTarget,
  setTestTarget,
  path,
  setPath,
  method,
  setMethod,
  concurrency,
  setConcurrency,
  duration,
  setDuration,
  testProfile,
  setTestProfile,
  stages,
  setStages,
  headersText,
  setHeadersText,
  bodyText,
  setBodyText,
  timeoutMs,
  setTimeoutMs,
  authorized,
  setAuthorized,
  starting,
  error,
  canRun,
  launchTest,
  onClose,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyPreset = (type: 'quick' | 'standard' | 'spike') => {
    if (type === 'quick') {
      setTestProfile('fixed');
      setConcurrency(5);
      setDuration(5);
    } else if (type === 'standard') {
      setTestProfile('fixed');
      setConcurrency(20);
      setDuration(15);
    } else if (type === 'spike') {
      setTestProfile('stages');
      setStages([
        { target: 10, durationSec: 5 },
        { target: 40, durationSec: 10 },
        { target: 0, durationSec: 5 },
      ]);
    }
  };

  const methods = [
    { name: 'GET', color: '#3B82F6' },
    { name: 'POST', color: '#10B981' },
    { name: 'PUT', color: '#F59E0B' },
    { name: 'PATCH', color: '#8B5CF6' },
    { name: 'DELETE', color: '#EF4444' },
  ];

  return (
    <Modal
      title="Configure Load Test"
      subtitle="Define workload curves, virtual user concurrency, and HTTP request specifications."
      onClose={onClose}
      wide
    >
      <form onSubmit={launchTest} className="form-stack">
        {/* Preset Capsules */}
        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick Workload Presets
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              className="social-btn"
              style={{ padding: '8px 12px', fontSize: '11px', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
              onClick={() => applyPreset('quick')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>🚀 Quick Ping</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>5 VUs · 5s test</span>
            </button>

            <button
              type="button"
              className="social-btn"
              style={{ padding: '8px 12px', fontSize: '11px', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
              onClick={() => applyPreset('standard')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>⚡ Standard</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>20 VUs · 15s test</span>
            </button>

            <button
              type="button"
              className="social-btn"
              style={{ padding: '8px 12px', fontSize: '11px', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
              onClick={() => applyPreset('spike')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>🔥 Spike Ramp-Up</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Staged: 10→40→0 VUs</span>
            </button>
          </div>
        </div>

        {/* Target Endpoint Selection */}
        {targets.length === 0 && <div className="target-auth-notice" role="status">
          <div><b>No saved targets yet</b><p>Sign in, then add your local endpoint before launching a test.</p></div>
          <Button type="button" variant="secondary" onClick={onAddTarget}>Add target</Button>
        </div>}
        {targets.length > 0 && !canRun && <div className="target-auth-notice" role="status">
          <div><b>Demo workspace is read-only</b><p>Sign in or create an account to execute a real test.</p></div>
          <Button type="button" variant="secondary" onClick={onAddTarget}>Sign in</Button>
        </div>}
        {error && <div className="warning-box" role="alert">{error}</div>}
        <label>
          Target Endpoint
          <select
            required
            className="cyber-input"
            value={testTarget}
            onChange={(e) => setTestTarget(e.target.value)}
            style={{ padding: '9px 12px' }}
          >
            <option value="">Select a registered target endpoint</option>
            {targets.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} — {t.url} ({t.verified ? 'Verified' : 'Unverified'})
              </option>
            ))}
          </select>
        </label>

        {/* HTTP Method & Path */}
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px' }}>
          <div>
            <label style={{ marginBottom: '6px', display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              HTTP Method
            </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {methods.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    border: method === m.name ? `1px solid ${m.color}` : '1px solid var(--border-default)',
                    background: method === m.name ? `${m.color}22` : 'var(--bg-subtle)',
                    color: method === m.name ? m.color : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setMethod(m.name)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <label>
            Endpoint Path
            <input
              required
              className="cyber-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/v1/checkout"
              pattern="/.*"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>
        </div>

        {/* Workload Profile Tabs */}
        <div>
          <label style={{ marginBottom: '6px', display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Workload Curve Profile
          </label>
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${testProfile === 'fixed' ? 'active' : ''}`}
              onClick={() => setTestProfile('fixed')}
            >
              Fixed Concurrency
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${testProfile === 'stages' ? 'active' : ''}`}
              onClick={() => setTestProfile('stages')}
            >
              Staged Traffic Curve (Ramp-Up)
            </button>
          </div>
        </div>

        {testProfile === 'fixed' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'var(--bg-subtle)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            <label>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Virtual Users (Concurrency)</span>
                <b style={{ color: 'var(--color-blue)', fontFamily: 'var(--font-mono)' }}>{concurrency} VUs</b>
              </div>
              <input
                type="range"
                min="1"
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                style={{ accentColor: 'var(--color-blue)', marginTop: '8px' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>Peak simultaneous load</span>
            </label>

            <label>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Test Duration</span>
                <b style={{ color: 'var(--color-blue)', fontFamily: 'var(--font-mono)' }}>{duration}s</b>
              </div>
              <input
                type="range"
                min="3"
                max={60}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={{ accentColor: 'var(--color-blue)', marginTop: '8px' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>Execution window</span>
            </label>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-subtle)',
              padding: '14px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <b style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                Workload Stages (Ramp-Up → Steady State → Ramp-Down)
              </b>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (stages.length < 5) setStages([...stages, { target: 10, durationSec: 5 }]);
                }}
              >
                + Add Stage
              </button>
            </div>

            {stages.map((stg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '11px', minWidth: '60px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Stage {idx + 1}:
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="cyber-input"
                  value={stg.target}
                  style={{ width: '80px', padding: '6px 8px' }}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(50, Number(e.target.value)));
                    setStages(stages.map((s, i) => (i === idx ? { ...s, target: val } : s)));
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VUs over</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="cyber-input"
                  value={stg.durationSec}
                  style={{ width: '80px', padding: '6px 8px' }}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(60, Number(e.target.value)));
                    setStages(stages.map((s, i) => (i === idx ? { ...s, durationSec: val } : s)));
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>seconds</span>
                {stages.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ width: 24, height: 24 }}
                    onClick={() => setStages(stages.filter((_, i) => i !== idx))}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
              Total Duration: {stages.reduce((a, s) => a + s.durationSec, 0)}s · Peak: {Math.max(...stages.map((s) => s.target))} VUs
            </div>
          </div>
        )}

        {/* Collapsible Advanced Options */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-blue)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              padding: 0,
            }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options (Headers, Request Body, Timeout)'}</span>
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {['POST', 'PUT', 'PATCH'].includes(method) && (
                <label>
                  Request Payload (JSON)
                  <textarea
                    rows={3}
                    className="cyber-input"
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder='{"event": "checkout", "currency": "USD", "items": [101, 102]}'
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                </label>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label>
                  Custom Headers (Key: Value)
                  <textarea
                    rows={2}
                    className="cyber-input"
                    value={headersText}
                    onChange={(e) => setHeadersText(e.target.value)}
                    placeholder="Authorization: Bearer dev-token&#10;X-Client-Region: us-east-1"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                  />
                </label>
                <label>
                  Request Timeout ({timeoutMs / 1000}s)
                  <input
                    type="range"
                    min={1000}
                    max={10000}
                    step={500}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    style={{ accentColor: 'var(--color-blue)', marginTop: '8px' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Fail-fast threshold (1s–10s)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Ownership Confirmation */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            background: 'var(--bg-subtle)',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-default)',
          }}
        >
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--color-blue)' }}
          />
          <span>I confirm explicit authorization to benchmark this target endpoint.</span>
        </label>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: '8px' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="btn-hero-primary"
            disabled={starting || !authorized || !testTarget || !canRun}
            icon={<Play size={14} fill="currentColor" />}
          >
            {starting ? 'Starting Execution…' : 'Launch Load Test'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
