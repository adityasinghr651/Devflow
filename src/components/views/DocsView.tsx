import React from 'react';
import { BookOpen, Code2, CreditCard, Database, GitBranch, Play, Radio, ShieldCheck, Server } from 'lucide-react';
import { Card } from '../ui/Card.tsx';

interface DocsViewProps { onNavigate: (page: string) => void; }

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <li style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 9, alignItems: 'start', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
    <span aria-hidden="true" style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 99, background: 'var(--bg-subtle)', color: 'var(--color-lime)', fontWeight: 700 }}>{number}</span>
    <span><b style={{ color: 'var(--text-primary)' }}>{title}</b><br />{children}</span>
  </li>;
}

function GuideCard({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <Card className="doc-card">
    <div style={{ color: 'var(--color-lime)', marginBottom: 12 }}>{icon}</div>
    <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>{title}</h3>
    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>{children}</div>
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </Card>;
}

export const DocsView: React.FC<DocsViewProps> = ({ onNavigate }) => {
  const linkButton = (label: string, page: string) => <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate(page)}>{label}</button>;
  return <div className="page-animate">
    <div className="dev-card" style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--color-lime)' }}><BookOpen size={22} /></div>
        <div style={{ flex: '1 1 420px' }}>
          <h2 style={{ margin: '0 0 5px', fontSize: 18, color: 'var(--text-primary)' }}>DevFlow user guide</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.65 }}>
            Follow the steps below to save an API target, run your first workload, read the result, and then set up a CI regression check. Start with a low-volume test against a service you own or are authorized to test.
          </p>
          <div style={{ marginTop: 12 }}><a href="https://github.com/adityasinghr651/Devflow/blob/devflow-2.0/docs/USER_GUIDE.md" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open full step-by-step guide</a></div>
        </div>
      </div>
    </div>

    <div className="docs-grid">
      <GuideCard icon={<Server size={24} />} title="1. Add an API target" action={linkButton('Open API Targets', 'API Targets')}>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
          <Step number={1} title="Choose a safe environment.">Use a development or staging API first. The DevFlow API server must be able to reach its base URL.</Step>
          <Step number={2} title="Save the base URL.">Enter the origin, such as <code>http://127.0.0.1:5050</code>. Add the route later in the test form.</Step>
          <Step number={3} title="Verify remote domains.">For non-local targets, follow the DNS TXT or HTTP challenge shown by Verify Domain.</Step>
        </ol>
        <p><b>Local note:</b> <code>localhost</code> refers to the machine running DevFlow. A hosted API or GitHub runner cannot use your laptop's loopback address.</p>
      </GuideCard>

      <GuideCard icon={<Play size={24} />} title="2. Run your first test" action={linkButton('Open Test Runs', 'Test Runs')}>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
          <Step number={1} title="Select a saved target.">Choose a verified target and a harmless read-only route such as <code>/health</code>.</Step>
          <Step number={2} title="Start with Quick Ping.">The preset uses 5 virtual users for 5 seconds. Keep the first run small and avoid production write endpoints.</Step>
          <Step number={3} title="Confirm authorization and run.">Review method, path, duration, and request body before you start.</Step>
        </ol>
        <p>Increase traffic only after the small run behaves as expected. Longer runs and higher concurrency create more requests.</p>
      </GuideCard>

      <GuideCard icon={<Radio size={24} />} title="3. Read the result">
        <p><b>Requests/sec</b> is throughput. <b>p95 latency</b> means 95% of measured responses completed at or below that time. <b>Error rate</b> is the share of failed requests.</p>
        <p>Use Live Metrics during an active run. Open History or a run detail afterward to compare completed measurements and inspect failures.</p>
        <p>Compare runs with the same target, route, method, workload, and environment; changing these makes the results less comparable.</p>
      </GuideCard>

      <GuideCard icon={<GitBranch size={24} />} title="4. Add a CI regression check" action={linkButton('Open Comparisons', 'Comparisons')}>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
          <Step number={1} title="Save a stable target and workload.">Set up the target in DevFlow, then run the same workload repeatedly.</Step>
          <Step number={2} title="Create enough history.">At least 3 completed comparable runs are required before a statistical verdict is available.</Step>
          <Step number={3} title="Configure the CLI or GitHub Action.">Use <code>devflow check --init</code>, set the target ID, and add <code>DEVFLOW_API_URL</code> and <code>DEVFLOW_TOKEN</code> as repository secrets.</Step>
          <Step number={4} title="Review the pull-request result.">The Action posts a summary and uploads a JSON result artifact.</Step>
        </ol>
        <p>Baseline matching currently uses the account owner and workload fingerprint; branch-isolated baselines are not guaranteed. The hosted CI workflow still needs an external pilot.</p>
      </GuideCard>

      <GuideCard icon={<Database size={24} />} title="5. Save and retain your data">
        <p>Sign in to save targets and runs to your account. Demo mode is temporary and read-only; create an account for persistent records.</p>
        <p>With <code>DATABASE_URL</code> unset, the API uses local JSON files under <code>DATA_DIR</code>. PostgreSQL and Supabase are also supported; set <code>DB_SSL=true</code> for managed Postgres.</p>
        <p>Optional Supabase Auth handles email identity when <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> are configured on the API. DevFlow still controls roles and workspace access.</p>
        <a href="https://github.com/adityasinghr651/Devflow/blob/devflow-2.0/docs/DATABASE_SETUP.md" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Read database setup</a>
      </GuideCard>

      <GuideCard icon={<CreditCard size={24} />} title="6. Plans and payments" action={linkButton('Open Billing & Plans', 'Billing & Plans')}>
        <p>View current plan, configured Pro price, Razorpay Checkout, and the UPI QR together on Billing &amp; Plans.</p>
        <p>Checkout verifies payment automatically. QR payments need administrator review before Pro access is activated. Billing is one-time, not a subscription.</p>
      </GuideCard>

      <GuideCard icon={<ShieldCheck size={24} />} title="Safety and CI security">
        <p>Only test systems you own or have written permission to test. Prefer staging, low initial concurrency, and read-only endpoints.</p>
        <p>Never commit API tokens or database/payment secrets. GitHub does not provide repository secrets to fork pull-request workflows; do not expose privileged tokens to untrusted code.</p>
      </GuideCard>

      <GuideCard icon={<Code2 size={24} />} title="Troubleshooting">
        <p><b>No target in the test selector:</b> save the target while signed in, then refresh.</p>
        <p><b>Target unreachable:</b> check the URL from the API host/container, not only your browser.</p>
        <p><b>Insufficient baseline:</b> run at least three tests with the exact same workload configuration.</p>
        <p><b>Billing unavailable:</b> the operator must configure Razorpay credentials and <code>UPGRADE_PLAN_PRICE_INR</code>.</p>
      </GuideCard>
    </div>
  </div>;
};
