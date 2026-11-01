import React from 'react';
import { BookOpen, Code2, Radio, ShieldCheck } from 'lucide-react';
import { Card } from '../ui/Card.tsx';

export const DocsView: React.FC = () => {
  return (
    <div className="docs-grid page-animate">
      <Card className="doc-card">
        <div style={{ color: 'var(--color-blue-light)', marginBottom: '12px' }}>
          <BookOpen size={24} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          Staged Workload Profiles
        </h3>
        <p style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          Configure multi-stage virtual user traffic curves including linear ramp-up, steady-state saturation, and controlled cool-down to evaluate how targets respond to dynamic load spikes.
        </p>
      </Card>

      <Card className="doc-card">
        <div style={{ color: 'var(--color-lime)', marginBottom: '12px' }}>
          <Radio size={24} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          Zero-Polling SSE Telemetry
        </h3>
        <p style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          Server-Sent Events stream sub-second metrics directly to your dashboard without client-side polling or API latency. The backend worker operates out-of-process to avoid event loop starvation.
        </p>
      </Card>

      <Card className="doc-card">
        <div style={{ color: 'var(--color-cyan)', marginBottom: '12px' }}>
          <ShieldCheck size={24} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          Cryptographic Domain Ownership
        </h3>
        <p style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          Non-local targets require proof of ownership via DNS TXT record or HTTP <code>.well-known</code> challenge file to prevent unauthorized testing or unintended denial-of-service vectors.
        </p>
      </Card>

      <Card className="doc-card">
        <div style={{ color: 'var(--color-blue)', marginBottom: '12px' }}>
          <Code2 size={24} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          Telemetry API Reference
        </h3>
        <p style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          Core REST endpoints powering the DevFlow platform:
        </p>
        <code style={{ display: 'block', background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.8, color: 'var(--color-blue-light)' }}>
          GET /api/runs/:id/events (SSE stream)<br />
          POST /api/targets/:id/verify (Domain proof)<br />
          POST /api/runs (Create and queue test)<br />
          POST /api/runs/:id/cancel (Graceful stop)
        </code>
      </Card>
    </div>
  );
};

