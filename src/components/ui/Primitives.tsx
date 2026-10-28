import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sun,
  Moon,
  Monitor,
  Check,
  Copy,
  AlertTriangle,
  X,
  RefreshCw,
  Inbox,
  Terminal,
  Cpu,
  Activity,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LoadRunSeriesPoint, ThemeMode } from '../../types';

// --- Theme Selector Control (Light / Dark / System) ---
export const ThemeSegmentedControl: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { theme, setTheme } = useApp();
  const modes: Array<{ id: ThemeMode; label: string; icon: React.ReactNode }> = [
    { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
    { id: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      role="group"
      aria-label="Color theme selector"
      className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
    >
      {modes.map((m) => {
        const active = theme === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setTheme(m.id)}
            title={`Switch to ${m.label} theme`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {m.icon}
            {!compact && <span>{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
};

// --- Clean Unboxed Metadata Row (Zero-Pill Compliance) ---
export const InlineMeta: React.FC<{ items: Array<React.ReactNode> }> = ({ items }) => {
  const valid = items.filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] font-mono tabular-nums">
      {valid.map((item, idx) => (
        <React.Fragment key={idx}>
          <span>{item}</span>
          {idx < valid.length - 1 && (
            <span aria-hidden="true" className="text-[var(--border-strong)]">
              ·
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// --- Copyable Code Block ---
export const CodeBlock: React.FC<{
  code: string;
  language?: string;
  title?: string;
}> = ({ code, language = 'bash', title }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
          <span>{title || language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[var(--status-success)]" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 text-xs font-mono leading-relaxed text-[var(--text-primary)] overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// --- Multi-Series SVG Latency Percentile Chart (p50 / p95 / p99) ---
export const LatencyPercentileChart: React.FC<{
  series: LoadRunSeriesPoint[];
  p95ThresholdMs?: number;
  height?: number;
}> = ({ series, p95ThresholdMs, height = 220 }) => {
  if (!series || series.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-[var(--text-muted)] font-mono border border-dashed border-[var(--border-subtle)] rounded-lg">
        Awaiting live telemetry ticks from server probe...
      </div>
    );
  }

  const width = 680;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal =
    Math.max(
      ...series.map((s) => Math.max(s.p99Ms, s.p95Ms, s.p50Ms)),
      p95ThresholdMs || 0,
      20
    ) * 1.15;

  const toX = (i: number) =>
    padLeft + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const toY = (val: number) => padTop + innerH - Math.min(1, Math.max(0, val / maxVal)) * innerH;

  const buildPath = (getter: (pt: LoadRunSeriesPoint) => number) =>
    series
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(getter(pt)).toFixed(1)}`)
      .join(' ');

  const p50Path = buildPath((d) => d.p50Ms);
  const p95Path = buildPath((d) => d.p95Ms);
  const p99Path = buildPath((d) => d.p99Ms);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t));

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3 text-xs font-mono tabular-nums">
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="w-3 h-0.5 bg-[var(--chart-p50)] inline-block" />
            p50 Median
          </span>
          <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="w-3 h-0.5 bg-[var(--chart-p95)] inline-block" />
            p95 Tail
          </span>
          <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="w-3 h-0.5 bg-[var(--chart-p99)] inline-block" />
            p99 Extreme
          </span>
        </div>
        {p95ThresholdMs && (
          <span className="text-[var(--text-muted)]">
            SLO Gate: p95 &le; {p95ThresholdMs}ms
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Latency percentiles over time"
      >
        {yTicks.map((tick, idx) => {
          const y = toY(tick);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[10px] font-mono"
              >
                {tick}ms
              </text>
            </g>
          );
        })}

        {p95ThresholdMs && p95ThresholdMs <= maxVal && (
          <line
            x1={padLeft}
            y1={toY(p95ThresholdMs)}
            x2={width - padRight}
            y2={toY(p95ThresholdMs)}
            stroke="var(--status-error)"
            strokeDasharray="5 4"
            strokeWidth="1.25"
          />
        )}

        <path d={p99Path} fill="none" stroke="var(--chart-p99)" strokeWidth="1.75" />
        <path d={p95Path} fill="none" stroke="var(--chart-p95)" strokeWidth="2.5" />
        <path d={p50Path} fill="none" stroke="var(--chart-p50)" strokeWidth="2" />

        {series.map((pt, i) => (
          <g key={pt.sec}>
            <circle cx={toX(i)} cy={toY(pt.p95Ms)} r="3.2" fill="var(--chart-p95)" />
            <circle cx={toX(i)} cy={toY(pt.p50Ms)} r="2.4" fill="var(--chart-p50)" />
            {(series.length <= 8 || i % 2 === 0) && (
              <text
                x={toX(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-[10px] font-mono"
              >
                {pt.sec}s
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

// --- Throughput (RPS) & Virtual Users Dual Telemetry Chart ---
export const ThroughputAreaChart: React.FC<{
  series: LoadRunSeriesPoint[];
  height?: number;
}> = ({ series, height = 200 }) => {
  if (!series || series.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-[var(--text-muted)] font-mono border border-dashed border-[var(--border-subtle)] rounded-lg">
        Awaiting live throughput samples...
      </div>
    );
  }

  const width = 680;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxRps = Math.max(...series.map((s) => s.rps), 40) * 1.15;
  const toX = (i: number) =>
    padLeft + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const toY = (val: number) => padTop + innerH - Math.min(1, Math.max(0, val / maxRps)) * innerH;

  const linePts = series
    .map((pt, i) => `${toX(i).toFixed(1)},${toY(pt.rps).toFixed(1)}`)
    .join(' ');
  const areaPts = `${padLeft},${padTop + innerH} ${linePts} ${toX(
    series.length - 1
  ).toFixed(1)},${padTop + innerH}`;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 text-xs font-mono tabular-nums">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="w-3 h-2 bg-[var(--accent-cobalt)] inline-block rounded-xs" />
            Throughput (req/s)
          </span>
          <span className="text-[var(--text-muted)]">
            Peak: {Math.max(...series.map((s) => s.rps)).toFixed(1)} req/s
          </span>
        </div>
        <span className="text-[var(--accent-lime-text)]">
          Active Concurrency: {series[series.length - 1]?.vus || 0} VUs
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Throughput requests per second chart"
      >
        {[0, 0.5, 1].map((t, idx) => {
          const val = Math.round(maxRps * t);
          const y = toY(val);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[10px] font-mono"
              >
                {val}
              </text>
            </g>
          );
        })}

        <polygon points={areaPts} fill="var(--accent-cobalt-soft)" />
        <polyline fill="none" stroke="var(--accent-cobalt)" strokeWidth="2.5" points={linePts} />

        {series.map((pt, i) =>
          series.length <= 8 || i % 2 === 0 ? (
            <text
              key={pt.sec}
              x={toX(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-[10px] font-mono"
            >
              {pt.sec}s
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
};

// --- Skeleton Loader State ---
export const TableSkeletonState: React.FC<{ rows?: number; label?: string }> = ({
  rows = 4,
  label = 'Synchronizing telemetry with Lab_Engineering server...',
}) => (
  <div className="surface-shiny rounded-xl p-6 space-y-4">
    <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
      <span>{label}</span>
      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-cobalt)]" />
    </div>
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded bg-[var(--bg-elevated)] animate-pulse border border-[var(--border-subtle)]"
        />
      ))}
    </div>
  </div>
);

// --- Empty State ---
export const EmptyWorkspaceState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}> = ({
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20, scale: 0.985 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -14, scale: 0.985 }}
    transition={{
      duration: 0.46,
      ease: [0.22, 1, 0.36, 1],
      layout: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
    }}
    className="surface-shiny rounded-xl p-10 text-center max-w-2xl mx-auto my-4"
  >
    <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] flex items-center justify-center mx-auto mb-4 text-[var(--accent-cobalt)]">
      <Inbox className="w-5 h-5" />
    </div>
    <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{title}</h3>
    <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">{description}</p>
    <div className="flex flex-wrap items-center justify-center gap-3">
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-cobalt-shiny px-5 py-2.5 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
      {secondaryLabel && onSecondaryAction && (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-[var(--accent-lime)] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  </motion.div>
);

// --- Error State ---
export const ErrorWorkspaceState: React.FC<{
  title: string;
  message: string;
  onRetry?: () => void;
}> = ({ title, message, onRetry }) => (
  <div className="surface-shiny rounded-xl border border-[var(--status-error)]/40 p-6">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[var(--status-error)] shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
        <p className="text-xs font-mono text-[var(--text-secondary)] mb-4">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-cobalt)] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Request</span>
          </button>
        )}
      </div>
    </div>
  </div>
);

// --- Destructive / High-Impact Confirmation Modal ---
export const ConfirmActionModal: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">{description}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg text-white cursor-pointer ${
              tone === 'danger'
                ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                : 'btn-cobalt-shiny'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Interactive Developer Tools Inspector Drawer (Live Wire & Pool Telemetry) ---
export const DeveloperToolsConsole: React.FC = () => {
  const { devToolsOpen, setDevToolsOpen, devToolLogs, poolTelemetry, loadRuns } = useApp();
  const [activeTab, setActiveTab] = useState<'wire' | 'pool' | 'curl'>('wire');
  const runningTest = loadRuns.find((r) => r.status === 'running');

  return (
    <div className="fixed bottom-4 left-4 z-40 no-print">
      <AnimatePresence>
        {devToolsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mb-2 w-[92vw] max-w-3xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-[var(--accent-lime-text)]" />
                <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                  PULSEBENCH DEVTOOLS INSPECTOR — LIVE SERVER WIRE & PG POOL
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['wire', 'pool', 'curl'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTab(t)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded uppercase cursor-pointer ${
                      activeTab === t
                        ? 'bg-[#2563EB] text-white font-semibold'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {t === 'wire' ? `HTTP Wire (${devToolLogs.length})` : t === 'pool' ? 'PG Pool State' : 'cURL CLI'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDevToolsOpen(false)}
                  className="ml-2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label="Minimize Developer Tools"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs">
              {activeTab === 'wire' && (
                <div className="space-y-1.5">
                  {devToolLogs.length === 0 ? (
                    <div className="text-[var(--text-muted)] py-6 text-center">
                      No HTTP requests captured yet. Interact with any API or launch a benchmark run.
                    </div>
                  ) : (
                    devToolLogs.slice(0, 20).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-3 py-1.5 px-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[var(--accent-cobalt)] font-bold">{log.method}</span>
                          <span className="text-[var(--text-primary)] truncate">{log.path}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">[{log.source}]</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={
                              log.statusCode >= 400
                                ? 'text-[var(--status-error)] font-bold'
                                : 'text-[var(--status-success)] font-bold'
                            }
                          >
                            {log.statusCode}
                          </span>
                          <span className="text-[var(--accent-lime-text)]">{log.durationMs}ms</span>
                          <span className="text-[var(--text-muted)] text-[10px]">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'pool' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
                  <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)] text-[11px]">Pool Queries Executed</div>
                    <div className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                      {poolTelemetry?.count ?? 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)] text-[11px]">Active / Idle Connections</div>
                    <div className="text-lg font-bold text-[var(--accent-lime-text)] mt-0.5">
                      {poolTelemetry?.activeConnections ?? 0} / {poolTelemetry?.idleConnections ?? 20} (Max {poolTelemetry?.dbPoolMax ?? 20})
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)] text-[11px]">Avg WaitMs / Avg SqlMs</div>
                    <div className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                      {poolTelemetry?.avgWaitMs ?? 0}ms / {poolTelemetry?.avgSqlMs ?? 0}ms
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'curl' && (
                <CodeBlock
                  title="Live cURL Benchmark Trigger"
                  code={`# Trigger a live 10-second dynamic server benchmark run via API:
curl -X POST http://localhost:3000/api/load-runs/execute \\
  -H "Content-Type: application/json" \\
  -d '{"name":"CLI Triggered Load Test","targetId":1,"endpointPath":"/api/issues?page=1&limit=20","virtualUsers":25,"durationSec":10}'`}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setDevToolsOpen((o) => !o)}
        className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 backdrop-blur text-xs font-mono text-[var(--text-primary)] hover:border-[var(--accent-lime)] shadow-lg cursor-pointer"
      >
        <Terminal className="w-3.5 h-3.5 text-[var(--accent-lime-text)]" />
        <span>DevTools Inspector</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--accent-cobalt)] tabular-nums">
          {runningTest
            ? `STREAMING (${runningTest.elapsedSec}/${runningTest.durationSec}s)`
            : `Pool: ${poolTelemetry?.count ?? 0} ops`}
        </span>
        {devToolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
