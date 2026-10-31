import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock3, Code2, Gauge, GitBranch, Globe2, LayoutDashboard, Menu, Moon, Plus, Radio, Server, Settings, ShieldCheck, Sun, Terminal, Trash2, X, Play, Square, RefreshCw, Download, Search, Zap, LogIn, LogOut, Check, AlertTriangle, Layers, Send, Home, Sparkles, Lock, ExternalLink } from 'lucide-react';
import './index.css';

type User = { id: string; email: string; name: string; role: string };
type Target = {
  id: string;
  userId?: string;
  name: string;
  url: string;
  environment: string;
  verified?: boolean;
  verificationToken?: string;
  verificationMethod?: string;
  verifiedAt?: string;
  createdAt: string;
};

type Stage = { target: number; durationSec: number };

type Run = {
  id: string;
  userId?: string;
  targetId: string;
  targetName: string;
  url: string;
  method: string;
  concurrency: number;
  durationSec: number;
  profile?: string;
  stages?: Stage[];
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  status: string;
  startedAt: string;
  finishedAt?: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  statusCodes: Record<string, number>;
  error?: string;
  currentConcurrency?: number;
  progressPercent?: number;
};

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n || 0);

export default function App() {
  const [page, setPage] = useState<string>('Home');
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => (localStorage.getItem('servertest-theme') as 'dark' | 'light' | 'system') || 'system');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('servertest-token'));
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [socialPrompt, setSocialPrompt] = useState<'github' | 'google' | null>(null);
  const [socialEmail, setSocialEmail] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const [targets, setTargets] = useState<Target[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [showTarget, setShowTarget] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [verifyingTarget, setVerifyingTarget] = useState<Target | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<{
    concurrency?: number;
    progressPercent?: number;
    rps?: number;
    totalRequests?: number;
    errorRate?: number;
    statusCodes?: Record<string, number>;
  }>({});
  const [query, setQuery] = useState('');

  // Target creation form
  const [targetName, setTargetName] = useState('Local API');
  const [targetUrl, setTargetUrl] = useState('http://localhost:3001');
  const [environment, setEnvironment] = useState('Development');

  // Test configuration form
  const [testTarget, setTestTarget] = useState('');
  const [path, setPath] = useState('/');
  const [method, setMethod] = useState('GET');
  const [concurrency, setConcurrency] = useState(5);
  const [duration, setDuration] = useState(10);
  const [testProfile, setTestProfile] = useState<'fixed' | 'stages'>('fixed');
  const [stages, setStages] = useState<Stage[]>([
    { target: 5, durationSec: 5 },
    { target: 10, durationSec: 10 },
    { target: 0, durationSec: 5 },
  ]);
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(5000);
  const [authorized, setAuthorized] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    localStorage.setItem('servertest-theme', theme);
    const apply = () => {
      const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  async function request<T>(route: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const r = await fetch(`${API}${route}`, { ...options, headers });
    const body = await r.json().catch(() => ({ error: 'Invalid server response' }));
    if (!r.ok) {
      if (r.status === 401 && !route.startsWith('/auth/')) {
        localStorage.removeItem('servertest-token');
        setToken(null);
        setUser(null);
        setNotice('Session expired. Please sign in again.');
        setShowAuth(true);
      }
      throw new Error(body.error || `Request failed (${r.status})`);
    }
    return body;
  }

  async function refresh() {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [t, r] = await Promise.all([request<Target[]>('/targets'), request<Run[]>('/runs')]);
      setTargets(t);
      setRuns(r);
    } catch (e) {
      setNotice(`API error: ${e instanceof Error ? e.message : 'Could not connect'}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      request<{ user: User }>('/auth/me')
        .then(res => {
          setUser(res.user);
          refresh();
        })
        .catch(() => {
          localStorage.removeItem('servertest-token');
          setToken(null);
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    const timer = setInterval(() => {
      request<Run[]>('/runs').then(setRuns).catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [token, user]);

  // Server-Sent Events (SSE) live metric stream for selected run
  useEffect(() => {
    if (!selectedRun || !token) return;
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(selectedRun.status)) {
      setLiveMetrics({});
      return;
    }

    const sseUrl = `${API}/runs/${selectedRun.id}/events?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLiveMetrics({
          concurrency: data.currentConcurrency,
          progressPercent: data.progressPercent,
          rps: data.rps,
          totalRequests: data.totalRequests,
          errorRate: data.errorRate,
          statusCodes: data.statusCodes,
        });
        setSelectedRun(prev => prev ? { ...prev, ...data } : null);
      } catch {}
    });

    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        setSelectedRun(prev => prev ? { ...prev, status: data.status, error: data.error } : null);
      } catch {}
    });

    eventSource.addEventListener('end', (e) => {
      try {
        const data = JSON.parse(e.data);
        setSelectedRun(prev => prev ? { ...prev, status: data.status || 'completed' } : null);
      } catch {}
      eventSource.close();
      refresh();
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedRun?.id, token]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError('');
    try {
      if (authMode === 'register') {
        const res = await request<{ user: User; token: string }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword, name: authName }),
        });
        localStorage.setItem('servertest-token', res.token);
        setToken(res.token);
        setUser(res.user);
        setShowAuth(false);
        setNotice(`Welcome to ServerTest, ${res.user.name}!`);
        const dest = pendingDestination || 'Overview';
        setPendingDestination(null);
        setPage(dest);
      } else {
        const res = await request<{ user: User; token: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword }),
        });
        localStorage.setItem('servertest-token', res.token);
        setToken(res.token);
        setUser(res.user);
        setShowAuth(false);
        setNotice(`Welcome back, ${res.user.name}!`);
        const dest = pendingDestination || 'Overview';
        setPendingDestination(null);
        setPage(dest);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSocialAuth(provider: 'github' | 'google', customEmail?: string) {
    setAuthSubmitting(true);
    setAuthError('');
    const emailToUse = customEmail || socialEmail || (provider === 'github' ? 'developer@github.com' : 'developer@gmail.com');
    const defaultName = provider === 'github' ? 'GitHub Developer' : 'Google User';
    try {
      const res = await request<{ user: User; token: string }>('/auth/oauth', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          email: emailToUse.trim(),
          name: defaultName,
        }),
      });
      localStorage.setItem('servertest-token', res.token);
      setToken(res.token);
      setUser(res.user);
      setShowAuth(false);
      setSocialPrompt(null);
      setNotice(`Signed in with ${provider === 'github' ? 'GitHub' : 'Google'} as ${res.user.email}`);
      const dest = pendingDestination || 'Overview';
      setPendingDestination(null);
      setPage(dest);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Social authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleProtectedNav(targetPage: string) {
    if (!user && targetPage !== 'Home' && targetPage !== 'Documentation') {
      setPendingDestination(targetPage);
      setShowAuth(true);
      setNotice(`Authentication required: Please sign in or create an account with GitHub, Google, or Email to access ${targetPage}.`);
      return;
    }
    setPage(targetPage);
    if (targetPage === 'Create Test') {
      setTestTarget(targets[0]?.id || '');
      setShowTest(true);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLogout() {
    if (token) {
      request('/auth/logout', { method: 'POST' }).catch(() => {});
    }
    localStorage.removeItem('servertest-token');
    setToken(null);
    setUser(null);
    setTargets([]);
    setRuns([]);
    setPage('Home');
    setNotice('You have been signed out.');
  }

  const activeRuns = runs.filter(r => ['running', 'queued', 'validating'].includes(r.status));
  const completed = runs.filter(r => r.status === 'completed');
  const latest = completed[0];

  async function addTarget(e: React.FormEvent) {
    e.preventDefault();
    try {
      const t = await request<Target>('/targets', {
        method: 'POST',
        body: JSON.stringify({ name: targetName, url: targetUrl, environment }),
      });
      setTargets(p => [t, ...p]);
      setShowTarget(false);
      setNotice(t.verified ? 'Target saved and verified for local development.' : 'Target saved. Domain ownership verification required before testing.');
      setTargetName('Local API');
      setTargetUrl('http://localhost:3001');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save target');
    }
  }

  async function verifyDomain(targetId: string) {
    setVerifyLoading(true);
    try {
      const res = await request<{ verified: boolean; target: Target }>(`/targets/${targetId}/verify`, {
        method: 'POST',
      });
      if (res.verified) {
        setTargets(p => p.map(t => (t.id === targetId ? res.target : t)));
        setVerifyingTarget(null);
        setNotice('Target domain ownership verified successfully!');
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Domain verification failed.');
    } finally {
      setVerifyLoading(false);
    }
  }

  async function launchTest(e: React.FormEvent) {
    e.preventDefault();
    if (!authorized) {
      setNotice('Confirm that you own or are authorized to test this target.');
      return;
    }
    setStarting(true);
    try {
      const t = targets.find(x => x.id === testTarget);
      if (!t) throw new Error('Select a target first');

      // Parse custom headers
      const parsedHeaders: Record<string, string> = {};
      if (headersText.trim()) {
        headersText.split('\n').forEach(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const k = line.slice(0, colonIdx).trim();
            const v = line.slice(colonIdx + 1).trim();
            if (k && v) parsedHeaders[k] = v;
          }
        });
      }

      const payload: any = {
        targetId: t.id,
        path,
        method,
        authorized,
        headers: parsedHeaders,
        body: ['POST', 'PUT', 'PATCH'].includes(method) && bodyText.trim() ? bodyText.trim() : undefined,
        timeoutMs,
      };

      if (testProfile === 'stages') {
        payload.profile = 'stages';
        payload.stages = stages;
      } else {
        payload.profile = 'fixed';
        payload.concurrency = concurrency;
        payload.durationSec = duration;
      }

      const run = await request<Run>('/runs', { method: 'POST', body: JSON.stringify(payload) });
      setRuns(p => [run, ...p]);
      setShowTest(false);
      setPage('Test Runs');
      setSelectedRun(run);
      setNotice('Test queued. Live metrics streaming via SSE.');
      setAuthorized(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start test');
    } finally {
      setStarting(false);
    }
  }

  async function stopRun(id: string) {
    try {
      await request(`/runs/${id}/cancel`, { method: 'POST' });
      await refresh();
      setNotice('Cancellation requested.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not cancel run');
    }
  }

  async function deleteTarget(id: string) {
    try {
      await request(`/targets/${id}`, { method: 'DELETE' });
      setTargets(p => p.filter(t => t.id !== id));
      setNotice('Target deleted.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not delete target');
    }
  }

  function exportRun(run: Run) {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `servertest-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const nav = [
    { name: 'Home', icon: Home, isPublic: true },
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Servers & Targets', icon: Server },
    { name: 'Create Test', icon: Plus },
    { name: 'Test Runs', icon: Activity },
    { name: 'Performance Analysis', icon: Gauge },
    { name: 'Reports', icon: BarChart3 },
    { name: 'Comparisons', icon: GitBranch },
    { name: 'Documentation', icon: BookOpen, isPublic: true },
    { name: 'Settings', icon: Settings },
  ];

  const visibleRuns = useMemo(
    () => runs.filter(r => `${r.targetName} ${r.status} ${r.id}`.toLowerCase().includes(query.toLowerCase())),
    [runs, query]
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => setPage('Home')}>
          <div className="brand-mark"><Activity size={21} /></div>
          <div><strong>ServerTest</strong><small>PERFORMANCE ENGINEERING</small></div>
          <button className="icon-button mobile-close" onClick={e => { e.stopPropagation(); setMobileNav(false); }}><X size={17} /></button>
        </div>
        <div className="workspace">
          <div className="workspace-icon"><Terminal size={16} /></div>
          <div>
            <b>{user ? `${user.name}'s workspace` : 'DevFlow ServerTest'}</b>
            <span>{user ? user.email : 'Public preview edition'}</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">PLATFORM</div>
        <nav>
          {nav.slice(0, 8).map(item => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => {
                setMobileNav(false);
                handleProtectedNav(item.name);
              }}
            >
              <item.icon size={17} />
              <span>{item.name}</span>
              {item.name === 'Test Runs' && activeRuns.length > 0 && <em>{activeRuns.length}</em>}
            </button>
          ))}
        </nav>
        <div className="nav-label secondary-label">RESOURCES</div>
        <nav>
          {nav.slice(8).map(item => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => {
                setMobileNav(false);
                handleProtectedNav(item.name);
              }}
            >
              <item.icon size={17} />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-line">
            <span className="status-dot" />
            <span>Local API</span>
            <span className="status-ok">Live SSE</span>
          </div>
          <div className="sidebar-note">*Live metrics streaming enabled.</div>
          <a href="https://github.com/adityasinghr651/Devflow" target="_blank" rel="noreferrer">
            <Code2 size={15} /> Open-source project <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>

      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="breadcrumbs">
            <span style={{ cursor: 'pointer' }} onClick={() => setPage('Home')}>DevFlow</span>
            <span className="crumb-slash">/</span>
            <b>{page}</b>
          </div>
          <div className="top-actions">
            <div className="api-indicator"><span className="status-dot" /> API <span className="api-host">localhost:4000</span></div>
            <div className="theme-switch" title="Theme">
              <button className={theme === 'light' ? 'chosen' : ''} onClick={() => setTheme('light')} aria-label="Light theme"><Sun size={15} /></button>
              <button className={theme === 'dark' ? 'chosen' : ''} onClick={() => setTheme('dark')} aria-label="Dark theme"><Moon size={15} /></button>
              <button className={theme === 'system' ? 'chosen' : ''} onClick={() => setTheme('system')} aria-label="System theme"><Settings size={15} /></button>
            </div>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {page === 'Home' && (
                  <button className="button primary small" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => setPage('Overview')}>
                    Open Workspace <ArrowUpRight size={13} />
                  </button>
                )}
                <button
                  className="avatar"
                  title={`Signed in as ${user.name} (${user.email})\nClick to log out`}
                  onClick={handleLogout}
                >
                  {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="text-button" onClick={() => { setPendingDestination('Overview'); setShowAuth(true); }}>
                  <LogIn size={15} /> Sign in
                </button>
                <button className="button primary" style={{ padding: '6px 13px', fontSize: '11px' }} onClick={() => { setPendingDestination('Overview'); setShowAuth(true); }}>
                  Get Started Free
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="content">
          {page !== 'Home' && (
            <div className="page-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> SERVER PERFORMANCE WORKSPACE</div>
                <h1>{page === 'Overview' ? 'Measure what matters.' : page}</h1>
                <p>
                  {page === 'Overview' ? 'Run controlled staged workloads against verified targets. Live metrics stream in real time.' :
                    page === 'Servers & Targets' ? 'Manage verified endpoints authorized for performance evaluation.' :
                    page === 'Test Runs' ? 'Track test execution lifecycle, stream live percentiles, and export raw summaries.' :
                    page === 'Performance Analysis' ? 'Evidence-led observations from completed test runs.' :
                    'A practical workspace for repeatable performance experiments.'}
                </p>
              </div>
              <div className="heading-actions">
                <button className="button secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
                <button className="button primary" onClick={() => handleProtectedNav('Create Test')}>
                  <Plus size={16} /> New test
                </button>
              </div>
            </div>
          )}

          {notice && (
            <div className="notice">
              <CircleHelp size={16} />
              <span>{notice}</span>
              <button onClick={() => setNotice('')}><X size={15} /></button>
            </div>
          )}

          {page === 'Home' && (
            <HomePage
              onStart={() => handleProtectedNav('Overview')}
              onLaunchTest={() => handleProtectedNav('Create Test')}
              user={user}
            />
          )}

          {page === 'Overview' && (
            <>
              <div className="callout">
                <div className="callout-icon"><ShieldCheck size={19} /></div>
                <div>
                  <b>Staged Workloads & Real-Time Metrics</b>
                  <p>Execute multi-stage ramp-up, steady-state, and ramp-down workloads against authorized targets with live Server-Sent Events metrics.</p>
                </div>
                <span className="callout-tag">PHASE 4</span>
              </div>
              <div className="metric-grid">
                <Metric label="Registered targets" value={targets.length.toString()} sub={`${targets.filter(t => t.verified).length} verified`} icon={Server} />
                <Metric label="Tests completed" value={fmt(completed.length)} sub="Durable results" icon={CheckCircle2} />
                <Metric label="Active test runs" value={activeRuns.length.toString()} sub="Live streaming" icon={Radio} />
                <Metric label="Latest throughput" value={latest ? `${latest.rps.toFixed(1)}` : '—'} unit={latest ? 'req/s' : ''} sub={latest ? 'Most recent test' : 'Run a test to collect measurements'} icon={Gauge} />
              </div>
              <div className="dashboard-grid">
                <section className="panel activity-panel">
                  <PanelTitle title="Recent test runs" detail="Latest activity" action={<button className="text-button" onClick={() => setPage('Test Runs')}>View all <ArrowUpRight size={14} /></button>} />
                  {runs.length === 0 ? (
                    <Empty icon={Activity} title="No test runs yet" body="Add an authorized target, then run your first staged load test." action={<button className="button primary" onClick={() => targets.length ? (setTestTarget(targets[0].id), setShowTest(true)) : setShowTarget(true)}>{targets.length ? 'Configure a test' : 'Add your first target'}</button>} />
                  ) : (
                    <div className="run-list">{runs.slice(0, 5).map(r => <RunRow key={r.id} run={r} onClick={() => setSelectedRun(r)} />)}</div>
                  )}
                </section>
                <section className="panel target-panel">
                  <PanelTitle title="Your targets" detail={`${targets.length} registered`} action={<button className="icon-button small" onClick={() => setShowTarget(true)}><Plus size={16} /></button>} />
                  {targets.length === 0 ? (
                    <Empty icon={Globe2} title="No targets configured" body="Register an endpoint you own or have explicit authorization to assess." action={<button className="button secondary" onClick={() => setShowTarget(true)}>Add target</button>} />
                  ) : (
                    <div className="target-list">{targets.slice(0, 4).map(t => (
                      <div className="target-row" key={t.id}>
                        <div className="target-symbol"><Server size={17} /></div>
                        <div className="target-info">
                          <b>{t.name}</b>
                          <span>{t.url}</span>
                        </div>
                        <span className={`status-pill ${t.verified ? 'completed' : 'warning'}`}>
                          <i />{t.verified ? 'Verified' : 'Unverified'}
                        </span>
                      </div>
                    ))}</div>
                  )}
                  <div className="panel-footer"><button className="text-button" onClick={() => setPage('Servers & Targets')}>Manage targets <ArrowUpRight size={14} /></button></div>
                </section>
              </div>
              <section className="panel getting-started">
                <PanelTitle title="Performance engineering workflow" detail="Getting started" />
                <div className="steps">
                  <Step n="01" title="Register & verify target" body="Add an API and verify domain ownership." done={targets.some(t => t.verified)} />
                  <Step n="02" title="Configure workload stages" body="Define ramp-up, steady-state, and ramp-down stages." done={runs.length > 0} />
                  <Step n="03" title="Inspect live metrics" body="Observe real-time throughput, latency percentiles, and status codes." done={completed.length > 0} />
                </div>
              </section>
            </>
          )}

          {page === 'Servers & Targets' && (
            <section className="panel full-panel">
              <PanelTitle title="Registered targets" detail="Non-local targets require ownership verification before testing." action={<button className="button primary" onClick={() => setShowTarget(true)}><Plus size={15} /> Add target</button>} />
              {targets.length === 0 ? (
                <Empty icon={Server} title="No targets registered" body="Targets are securely isolated per user account. Add an endpoint to begin." action={<button className="button primary" onClick={() => setShowTarget(true)}>Register target</button>} />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>TARGET</th><th>BASE URL</th><th>ENVIRONMENT</th><th>VERIFICATION</th><th>ADDED</th><th /></tr>
                    </thead>
                    <tbody>
                      {targets.map(t => (
                        <tr key={t.id}>
                          <td><div className="table-name"><div className="target-symbol"><Server size={15} /></div><b>{t.name}</b></div></td>
                          <td className="mono">{t.url}</td>
                          <td><span className="env-pill">{t.environment}</span></td>
                          <td>
                            {t.verified ? (
                              <span className="status-pill completed"><i />Verified</span>
                            ) : (
                              <button className="status-pill warning" style={{ cursor: 'pointer' }} onClick={() => setVerifyingTarget(t)}>
                                <i />Verify ownership
                              </button>
                            )}
                          </td>
                          <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                          <td>
                            <div className="inline-actions">
                              {!t.verified && (
                                <button className="text-button" onClick={() => setVerifyingTarget(t)}>Verify</button>
                              )}
                              <button className="icon-button danger" title="Delete target" onClick={() => deleteTarget(t.id)}><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {page === 'Test Runs' && (
            <section className="panel full-panel">
              <PanelTitle title="Test run history" detail={`${runs.length} runs recorded · Live SSE streaming`} action={<div className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search runs…" /></div>} />
              {visibleRuns.length === 0 ? (
                <Empty icon={Activity} title="No matching test runs" body="Your test runs and their live measurements will appear here." action={<button className="button primary" onClick={() => targets.length ? (setTestTarget(targets[0].id), setShowTest(true)) : setShowTarget(true)}>Create a test</button>} />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>RUN / TARGET</th><th>PROFILE</th><th>STATUS</th><th>REQUESTS</th><th>THROUGHPUT</th><th>P95 LATENCY</th><th>ERROR RATE</th><th>ACTIONS</th></tr>
                    </thead>
                    <tbody>
                      {visibleRuns.map(r => (
                        <tr key={r.id}>
                          <td><button className="run-link" onClick={() => setSelectedRun(r)}><b>{r.targetName}</b><span className="mono">{r.id.slice(0, 8)} · {new Date(r.startedAt).toLocaleString()}</span></button></td>
                          <td><span className="env-pill">{r.profile === 'stages' ? 'Staged' : 'Fixed'}</span></td>
                          <td><Status status={r.status} /></td>
                          <td>{fmt(r.totalRequests)}</td>
                          <td>{['completed', 'running'].includes(r.status) ? `${r.rps.toFixed(1)} req/s` : '—'}</td>
                          <td>{r.status === 'completed' ? `${r.p95.toFixed(1)} ms` : '—'}</td>
                          <td>{r.status === 'completed' ? `${r.errorRate.toFixed(2)}%` : '—'}</td>
                          <td>
                            <div className="inline-actions">
                              <button className="text-button" onClick={() => setSelectedRun(r)}>
                                {['running', 'queued', 'validating'].includes(r.status) ? 'Live stream' : 'Details'}
                              </button>
                              {['running', 'queued', 'validating'].includes(r.status) && (
                                <button className="text-button danger-text" onClick={() => stopRun(r.id)}><Square size={12} /> Stop</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {page === 'Performance Analysis' && (
            <section className="panel full-panel">
              <PanelTitle title="Performance findings" detail="Deterministic observations · no AI-generated root-cause claims" />
              {!completed.length ? (
                <Empty icon={Gauge} title="No measurements to analyze" body="Complete a test run first. Analysis will use measured throughput, latency, and error rates." />
              ) : (
                <div className="findings">
                  {completed.slice(0, 10).map(r => (
                    <div className="finding" key={r.id}>
                      <div className={`finding-icon ${r.errorRate > 1 || r.p95 > 500 ? 'warning' : ''}`}><Activity size={17} /></div>
                      <div>
                        <b>{r.targetName} · {r.id.slice(0, 8)} ({r.profile === 'stages' ? 'Staged Workload' : 'Fixed Workload'})</b>
                        <p>
                          {r.errorRate > 1
                            ? `Observed ${r.errorRate.toFixed(2)}% request errors. Inspect response codes and server logs during this run.`
                            : r.p95 > 500
                            ? `p95 latency reached ${r.p95.toFixed(1)} ms. Check downstream dependencies and server saturation before inferring a cause.`
                            : `Observed p95 latency of ${r.p95.toFixed(1)} ms and ${r.errorRate.toFixed(2)}% errors. Compare with repeat runs.`}
                        </p>
                        <span className="finding-evidence">Evidence: {fmt(r.totalRequests)} requests · {r.rps.toFixed(1)} req/s · p99 {r.p99.toFixed(1)} ms</span>
                      </div>
                      <Status status={r.errorRate > 1 || r.p95 > 500 ? 'warning' : 'completed'} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {page === 'Reports' && (
            <section className="panel full-panel">
              <PanelTitle title="Exportable reports" detail="Download a JSON snapshot of measured results." />
              {completed.length === 0 ? (
                <Empty icon={BarChart3} title="Reports will appear here" body="Complete a test to export its measurements and configuration as JSON." />
              ) : (
                <div className="report-grid">
                  {completed.map(r => (
                    <div className="report-card" key={r.id}>
                      <div className="report-card-top"><div className="target-symbol"><BarChart3 size={17} /></div><Status status={r.status} /></div>
                      <b>{r.targetName}</b>
                      <span className="mono">{r.id}</span>
                      <div className="report-stats">
                        <span><small>Requests</small><b>{fmt(r.totalRequests)}</b></span>
                        <span><small>p95 latency</small><b>{r.p95.toFixed(1)} ms</b></span>
                        <span><small>Error rate</small><b>{r.errorRate.toFixed(2)}%</b></span>
                      </div>
                      <button className="button secondary full-button" onClick={() => exportRun(r)}><Download size={15} /> Export JSON</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {page === 'Comparisons' && (
            <section className="panel full-panel">
              <PanelTitle title="Compare completed runs" detail="Use equivalent workloads for meaningful comparisons." />
              {completed.length < 2 ? (
                <Empty icon={GitBranch} title="Two completed runs required" body="Run the same workload more than once to compare throughput, latency, and error rate." />
              ) : (
                <Compare runs={completed} />
              )}
            </section>
          )}

          {page === 'Documentation' && (
            <section className="docs-grid">
              <div className="panel doc-card">
                <BookOpen size={20} />
                <h3>Staged Workloads</h3>
                <p>Configure multi-stage ramp-up, steady-state, and ramp-down profiles to evaluate how targets respond to dynamic load changes.</p>
              </div>
              <div className="panel doc-card">
                <Radio size={20} />
                <h3>Live SSE Streaming</h3>
                <p>Server-Sent Events stream sub-second metrics directly to your browser without polling or event-loop blockage.</p>
              </div>
              <div className="panel doc-card">
                <ShieldCheck size={20} />
                <h3>Domain Ownership</h3>
                <p>Non-local targets require verification via DNS TXT or HTTP <code>.well-known</code> challenge to prevent unauthorized testing.</p>
              </div>
              <div className="panel doc-card">
                <Code2 size={20} />
                <h3>API Reference</h3>
                <p>
                  <code>GET /api/runs/:id/events</code><br />
                  <code>POST /api/targets/:id/verify</code><br />
                  <code>POST /api/runs</code>
                </p>
              </div>
            </section>
          )}

          {page === 'Settings' && (
            <section className="panel full-panel settings-panel">
              <PanelTitle title="Preferences" detail="User and application preferences" />
              <div className="setting-row">
                <div><b>User account</b><p>{user ? `Signed in as ${user.name} (${user.email})` : 'Not signed in'}</p></div>
                {user ? (
                  <button className="button secondary" onClick={handleLogout}><LogOut size={15} /> Sign out</button>
                ) : (
                  <button className="button primary" onClick={() => setShowAuth(true)}><LogIn size={15} /> Sign in</button>
                )}
              </div>
              <div className="setting-row">
                <div><b>Appearance</b><p>Choose a theme for this browser session.</p></div>
                <div className="theme-switch larger">
                  <button className={theme === 'light' ? 'chosen' : ''} onClick={() => setTheme('light')}><Sun size={15} /> Light</button>
                  <button className={theme === 'dark' ? 'chosen' : ''} onClick={() => setTheme('dark')}><Moon size={15} /> Dark</button>
                  <button className={theme === 'system' ? 'chosen' : ''} onClick={() => setTheme('system')}><Settings size={15} /> System</button>
                </div>
              </div>
              <div className="setting-row">
                <div><b>Live metrics engine</b><p>Server-Sent Events (SSE) with child process worker</p></div>
                <span className="env-pill">Active</span>
              </div>
              <div className="setting-row">
                <div><b>Data storage</b><p>PostgreSQL with JSON-fallback support.</p></div>
                <span className="env-pill">Persistent Engine</span>
              </div>
            </section>
          )}

          {!['Home', 'Overview', 'Servers & Targets', 'Test Runs', 'Performance Analysis', 'Reports', 'Comparisons', 'Documentation', 'Settings'].includes(page) && (
            <section className="panel full-panel">
              <Empty icon={Clock3} title="Not implemented in this MVP" body="This navigation area is reserved for a future iteration." />
            </section>
          )}

          <footer className="footer">
            <span>ServerTest <span className="footer-sep">/</span> Advanced performance engineering</span>
            <span><span className="footer-dot" /> Built for measured experiments</span>
          </footer>
        </div>
      </main>

      {/* Target Domain Verification Modal */}
      {verifyingTarget && (
        <Modal
          title="Verify Domain Ownership"
          subtitle={`Proof of control required for ${verifyingTarget.url}`}
          onClose={() => setVerifyingTarget(null)}
        >
          <div className="form-stack">
            <p style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
              To prevent unauthorized load testing, non-local targets must prove domain ownership before tests can be launched.
            </p>
            <div style={{ background: 'var(--bg-subtle, #1a1a1a)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #333)' }}>
              <b>Verification Token:</b>
              <code style={{ display: 'block', margin: '0.5rem 0', wordBreak: 'break-all' }}>
                {verifyingTarget.verificationToken || 'Generating…'}
              </code>
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              <b>Option 1: DNS TXT Record</b>
              <p>Add a TXT record for hostname: <code>_servertest.{new URL(verifyingTarget.url).hostname}</code> with value:</p>
              <code>servertest-verify={verifyingTarget.verificationToken}</code>
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              <b>Option 2: HTTP .well-known Challenge</b>
              <p>Host a plain-text file at:</p>
              <code>{verifyingTarget.url}/.well-known/servertest-challenge.txt</code>
              <p>containing the verification token as its content.</p>
            </div>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="button secondary" onClick={() => setVerifyingTarget(null)}>Cancel</button>
              <button
                type="button"
                disabled={verifyLoading}
                className="button primary"
                onClick={() => verifyDomain(verifyingTarget.id)}
              >
                {verifyLoading ? 'Checking verification…' : 'Verify ownership now'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Authentication Modal with GitHub, Google & Email */}
      {showAuth && (
        <Modal
          title={authMode === 'login' ? 'Sign in to DevFlow' : 'Create an Account'}
          subtitle="Continue with GitHub, Google, or email to access the performance workspace."
          onClose={() => {
            setShowAuth(false);
            setSocialPrompt(null);
            setAuthError('');
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {authError && <div className="warning-box"><CircleHelp size={16} /><span>{authError}</span></div>}

            {/* Social Logins */}
            <div className="social-auth-group">
              <button
                type="button"
                className="social-btn github"
                disabled={authSubmitting}
                onClick={() => {
                  if (socialPrompt === 'github') {
                    handleSocialAuth('github');
                  } else {
                    setSocialPrompt('github');
                    setSocialEmail('developer@github.com');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <span>Continue with GitHub</span>
              </button>

              <button
                type="button"
                className="social-btn google"
                disabled={authSubmitting}
                onClick={() => {
                  if (socialPrompt === 'google') {
                    handleSocialAuth('google');
                  } else {
                    setSocialPrompt('google');
                    setSocialEmail('developer@gmail.com');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.25C.45 8.15 0 9.94 0 12s.45 3.85 1.25 5.43l4.03-3.14z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.57l4.03 3.14c.95-2.83 3.6-4.96 6.72-4.96z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Inline Social Email Confirmation */}
            {socialPrompt && (
              <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ fontSize: '11px' }}>Authorize with {socialPrompt === 'github' ? 'GitHub' : 'Google'}</b>
                  <button type="button" className="text-button" onClick={() => setSocialPrompt(null)} style={{ padding: '0' }}><X size={14} /></button>
                </div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>
                  Account Email:
                  <input
                    type="email"
                    value={socialEmail}
                    onChange={e => setSocialEmail(e.target.value)}
                    placeholder={socialPrompt === 'github' ? 'user@github.com' : 'user@gmail.com'}
                    style={{ marginTop: '4px', width: '100%', boxSizing: 'border-box' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="button primary"
                    style={{ flex: 1 }}
                    disabled={authSubmitting || !socialEmail}
                    onClick={() => handleSocialAuth(socialPrompt, socialEmail)}
                  >
                    {authSubmitting ? 'Connecting…' : `Confirm & Sign in with ${socialPrompt === 'github' ? 'GitHub' : 'Google'}`}
                  </button>
                </div>
              </div>
            )}

            <div className="social-divider">or continue with email</div>

            {/* Email/Password Tabs */}
            <div className="auth-mode-tabs">
              <button
                type="button"
                className={`auth-mode-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-mode-tab ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleAuth} className="form-stack">
              {authMode === 'register' && (
                <label>Full name
                  <input required maxLength={80} value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Alex Mercer" />
                </label>
              )}
              <label>Email address
                <input required type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="engineer@company.com" />
              </label>
              <label>Password
                <input required type="password" minLength={8} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Minimum 8 characters" />
              </label>
              <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                <button type="submit" disabled={authSubmitting} className="button primary full-button">
                  {authSubmitting ? 'Please wait…' : authMode === 'login' ? 'Sign In to Workspace' : 'Create My Account'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Target Registration Modal */}
      {showTarget && (
        <Modal title="Register a target" subtitle="Add an API you own or are explicitly authorized to test." onClose={() => setShowTarget(false)}>
          <form onSubmit={addTarget} className="form-stack">
            <label>Target name<input required maxLength={80} value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="Development API" /></label>
            <label>Base URL<input required type="url" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="http://localhost:3001" /></label>
            <label>Environment
              <select value={environment} onChange={e => setEnvironment(e.target.value)}>
                <option>Development</option>
                <option>Staging</option>
                <option>Production</option>
                <option>Local</option>
              </select>
            </label>
            <div className="form-hint"><ShieldCheck size={16} /> Non-local targets will require domain verification before running tests.</div>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setShowTarget(false)}>Cancel</button>
              <button type="submit" className="button primary">Save target</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Test Launch Modal with Stages and Custom Requests */}
      {showTest && (
        <Modal title="Configure Performance Test" subtitle="Configure workload profile, HTTP request parameters, and timeout limits." onClose={() => setShowTest(false)} wide>
          <form onSubmit={launchTest} className="form-stack">
            <label>Target
              <select required value={testTarget} onChange={e => setTestTarget(e.target.value)}>
                <option value="">Select a registered target</option>
                {targets.map(t => (
                  <option value={t.id} key={t.id}>
                    {t.name} — {t.url} ({t.verified ? 'Verified' : 'Unverified'})
                  </option>
                ))}
              </select>
            </label>

            <div className="form-row">
              <label>HTTP method
                <select value={method} onChange={e => setMethod(e.target.value)}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label>Endpoint path<input required value={path} onChange={e => setPath(e.target.value)} placeholder="/health" pattern="/.*" /></label>
            </div>

            {/* Workload Profile Selector */}
            <div style={{ margin: '0.5rem 0' }}>
              <label style={{ marginBottom: '0.25rem', display: 'block', fontWeight: 600 }}>Workload Profile</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`button ${testProfile === 'fixed' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => setTestProfile('fixed')}
                >
                  Fixed Concurrency
                </button>
                <button
                  type="button"
                  className={`button ${testProfile === 'stages' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => setTestProfile('stages')}
                >
                  <Layers size={14} style={{ marginRight: '4px' }} /> Staged Workload
                </button>
              </div>
            </div>

            {testProfile === 'fixed' ? (
              <div className="form-row">
                <label>Concurrency <span className="field-value">{concurrency}</span>
                  <input type="range" min="1" max={20} value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} />
                  <small>Max 20 concurrent requests</small>
                </label>
                <label>Duration <span className="field-value">{duration}s</span>
                  <input type="range" min="1" max={30} value={duration} onChange={e => setDuration(Number(e.target.value))} />
                  <small>Max 30 seconds</small>
                </label>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-subtle, #1a1a1a)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #333)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <b style={{ fontSize: '0.875rem' }}>Workload Stages (Ramp-Up → Steady → Ramp-Down)</b>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      if (stages.length < 5) setStages([...stages, { target: 5, durationSec: 5 }]);
                    }}
                  >
                    + Add stage
                  </button>
                </div>
                {stages.map((stg, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', minWidth: '55px' }}>Stage {idx + 1}:</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={stg.target}
                      style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                      onChange={e => {
                        const val = Math.max(0, Math.min(20, Number(e.target.value)));
                        setStages(stages.map((s, i) => (i === idx ? { ...s, target: val } : s)));
                      }}
                    />
                    <span style={{ fontSize: '0.75rem' }}>VUs over</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={stg.durationSec}
                      style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                      onChange={e => {
                        const val = Math.max(1, Math.min(30, Number(e.target.value)));
                        setStages(stages.map((s, i) => (i === idx ? { ...s, durationSec: val } : s)));
                      }}
                    />
                    <span style={{ fontSize: '0.75rem' }}>seconds</span>
                    {stages.length > 1 && (
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => setStages(stages.filter((_, i) => i !== idx))}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <small style={{ color: 'var(--text-muted, #888)' }}>
                  Total Duration: {stages.reduce((a, s) => a + s.durationSec, 0)}s (Max 60s) · Peak: {Math.max(...stages.map(s => s.target))} VUs
                </small>
              </div>
            )}

            {/* Custom Request Configuration */}
            {['POST', 'PUT', 'PATCH'].includes(method) && (
              <label>Request Body (JSON or text)
                <textarea
                  rows={3}
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder='{"name": "test", "active": true}'
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </label>
            )}

            <div className="form-row">
              <label>Custom Headers (Key: Value per line)
                <textarea
                  rows={2}
                  value={headersText}
                  onChange={e => setHeadersText(e.target.value)}
                  placeholder="X-Custom-Header: value&#10;Content-Type: application/json"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </label>
              <label>Request Timeout <span className="field-value">{timeoutMs / 1000}s</span>
                <input
                  type="range"
                  min={1000}
                  max={10000}
                  step={500}
                  value={timeoutMs}
                  onChange={e => setTimeoutMs(Number(e.target.value))}
                />
                <small>Fail fast threshold (1s–10s)</small>
              </label>
            </div>

            <label className="checkbox-label">
              <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
              <span>I own this target or have explicit authorization to test it.</span>
            </label>
            <div className="warning-box"><Zap size={16} /><span>Live SSE metrics will stream as tests execute. Load generation runs out-of-process.</span></div>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setShowTest(false)}>Cancel</button>
              <button type="submit" disabled={starting || !authorized || !testTarget} className="button primary">
                <Play size={15} />{starting ? 'Starting…' : 'Run test'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Selected Run Details Modal with Live SSE Metrics */}
      {selectedRun && (
        <Modal title="Test Run Details" subtitle={`${selectedRun.id} · ${selectedRun.targetName}`} onClose={() => setSelectedRun(null)} wide>
          <div className="run-detail-top">
            <Status status={selectedRun.status} />
            <span className="mono">{selectedRun.method} {selectedRun.url}</span>
            {selectedRun.profile === 'stages' && <span className="env-pill">Staged Profile</span>}
          </div>

          {['running', 'queued', 'validating'].includes(selectedRun.status) ? (
            <div className="running-state">
              <div className="spinner" />
              <div style={{ flex: 1 }}>
                <b>Live test {selectedRun.status} (Streaming via SSE)</b>
                <p>
                  {liveMetrics.concurrency !== undefined ? `Active concurrency: ${liveMetrics.concurrency} virtual users` : 'Connecting to live worker stream…'}
                </p>
                {/* Live Progress Bar */}
                {liveMetrics.progressPercent !== undefined && (
                  <div style={{ background: 'var(--border-color, #333)', height: '6px', borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden' }}>
                    <div style={{ background: 'var(--primary, #3b82f6)', height: '100%', width: `${liveMetrics.progressPercent}%`, transition: 'width 0.3s ease' }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <span>Requests: <b>{fmt(selectedRun.totalRequests)}</b></span>
                  <span>Throughput: <b>{selectedRun.rps.toFixed(1)} req/s</b></span>
                  <span>Error rate: <b>{selectedRun.errorRate.toFixed(1)}%</b></span>
                </div>
              </div>
              <button className="button secondary" onClick={() => stopRun(selectedRun.id)}><Square size={14} /> Stop</button>
            </div>
          ) : selectedRun.status === 'failed' || selectedRun.status === 'timed_out' ? (
            <div className="warning-box"><CircleHelp size={16} />{selectedRun.error || 'The test failed or timed out. Review backend logs and target reachability.'}</div>
          ) : (
            <>
              <div className="detail-metrics">
                <Metric label="Total requests" value={fmt(selectedRun.totalRequests)} icon={Activity} />
                <Metric label="Throughput" value={selectedRun.rps.toFixed(1)} unit="req/s" icon={Gauge} />
                <Metric label="p95 latency" value={selectedRun.p95.toFixed(1)} unit="ms" icon={Clock3} />
                <Metric label="Error rate" value={selectedRun.errorRate.toFixed(2)} unit="%" icon={ArrowDownRight} />
              </div>
              <div className="percentile-row">
                <span>p50 <b>{selectedRun.p50.toFixed(1)} ms</b></span>
                <span>p95 <b>{selectedRun.p95.toFixed(1)} ms</b></span>
                <span>p99 <b>{selectedRun.p99.toFixed(1)} ms</b></span>
                <span>Successful <b>{fmt(selectedRun.successCount)}</b></span>
                <span>Failed <b>{fmt(selectedRun.failedCount)}</b></span>
              </div>
              <h4 className="subheading">HTTP status codes</h4>
              <div className="status-codes">
                {Object.entries(selectedRun.statusCodes || {}).length ? (
                  Object.entries(selectedRun.statusCodes).map(([code, count]) => (
                    <span key={code}><b>{code}</b>{fmt(count)}</span>
                  ))
                ) : (
                  <span>No status responses recorded</span>
                )}
              </div>
              <div className="modal-actions">
                <button className="button secondary" onClick={() => exportRun(selectedRun)}><Download size={15} /> Export JSON</button>
                <button className="button primary" onClick={() => setSelectedRun(null)}>Done</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value, unit, sub, icon: Icon }: { label: string; value: string; unit?: string; sub?: string; icon: any }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span><Icon size={16} /></div>
      <div className="metric-value">{value}<small>{unit}</small></div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function PanelTitle({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="panel-title">
      <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
      {action}
    </div>
  );
}

function Empty({ icon: Icon, title, body, action }: { icon: any; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={21} /></div>
      <b>{title}</b>
      <p>{body}</p>
      {action}
    </div>
  );
}

function RunRow({ run, onClick }: { run: Run; onClick: () => void }) {
  return (
    <button className="run-row" onClick={onClick}>
      <div className="run-symbol"><Activity size={16} /></div>
      <div className="run-main"><b>{run.targetName}</b><span>{new Date(run.startedAt).toLocaleString()} · {run.method}</span></div>
      <Status status={run.status} />
      <div className="run-result">
        <b>{run.status === 'completed' ? `${run.rps.toFixed(1)} req/s` : '—'}</b>
        <span>{run.status === 'completed' ? `p95 ${run.p95.toFixed(1)} ms` : run.status}</span>
      </div>
    </button>
  );
}

function Status({ status }: { status: string }) {
  const s = status.toLowerCase();
  const label = s === 'completed' ? 'Completed' :
    s === 'running' ? 'Running' :
    s === 'queued' ? 'Queued' :
    s === 'validating' ? 'Validating' :
    s === 'cancelled' ? 'Cancelled' :
    s === 'timed_out' ? 'Timed out' :
    s === 'failed' ? 'Failed' :
    s === 'warning' ? 'Review' : 'Unknown';
  return <span className={`status-pill ${s}`}><i />{label}</span>;
}

function Step({ n, title, body, done }: { n: string; title: string; body: string; done: boolean }) {
  return (
    <div className="step">
      <div className={`step-number ${done ? 'done' : ''}`}>{done ? <CheckCircle2 size={17} /> : n}</div>
      <div><b>{title}</b><p>{body}</p></div>
      <span className={`step-state ${done ? 'complete' : ''}`}>{done ? 'Complete' : 'Next step'}</span>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose, wide }: { title: string; subtitle: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div><h2>{title}</h2><p>{subtitle}</p></div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Compare({ runs }: { runs: Run[] }) {
  const a = runs[0], b = runs[1];
  const delta = (x: number, y: number) => `${x >= y ? '+' : ''}${(x - y).toFixed(1)}`;
  return (
    <div className="compare-grid">
      {[
        { label: 'Throughput', a: a.rps, b: b.rps, unit: 'req/s' },
        { label: 'p95 latency', a: a.p95, b: b.p95, unit: 'ms' },
        { label: 'Error rate', a: a.errorRate, b: b.errorRate, unit: '%' },
      ].map(m => (
        <div className="compare-card" key={m.label}>
          <span>{m.label}</span>
          <div><b>{m.a.toFixed(1)} {m.unit}</b><ArrowDownRight size={15} /><b>{m.b.toFixed(1)} {m.unit}</b></div>
          <small>Latest vs previous: {delta(m.a, m.b)} {m.unit}</small>
        </div>
      ))}
      <p className="compare-note">Comparisons are ordered by most recently completed run. Confirm that target, hardware, endpoint, concurrency, and duration are equivalent before interpreting changes.</p>
    </div>
  );
}

function HomePage({ onStart, onLaunchTest, user }: { onStart: () => void; onLaunchTest: () => void; user: User | null }) {
  const [simRps, setSimRps] = useState(542);
  const [simP95, setSimP95] = useState(19.4);
  const [simProgress, setSimProgress] = useState(68);

  useEffect(() => {
    const timer = setInterval(() => {
      setSimRps(Math.floor(520 + Math.random() * 55));
      setSimP95(Number((18 + Math.random() * 3).toFixed(1)));
      setSimProgress(prev => (prev >= 98 ? 15 : prev + 2));
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home-view">
      {/* 1. Hero Section */}
      <section className="home-hero">
        <div className="home-badge">
          <Sparkles size={14} /> NEXT-GEN API LOAD TESTING • K6 PRECISION & LIVE SSE
        </div>
        <h1>
          Stress-Test APIs with Confidence.<br />
          <span className="hero-gradient-text">Stream Live Telemetry in Real Time.</span>
        </h1>
        <p>
          DevFlow ServerTest empowers development teams and site reliability engineers to design staged virtual user workloads, enforce target ownership with cryptographic challenges, and observe sub-millisecond metrics over Server-Sent Events.
        </p>

        <div className="home-hero-ctas">
          <button className="button primary hero-btn" onClick={onStart}>
            {user ? 'Open Workspace' : 'Get Started Free'} <ArrowUpRight size={16} />
          </button>
          <button className="button secondary hero-btn" onClick={onLaunchTest}>
            <Play size={15} /> Launch Staged Test
          </button>
          <a href="#features" className="button secondary hero-btn">
            <Layers size={15} /> Explore Features
          </a>
        </div>

        <div className="home-hero-specs">
          <div className="home-spec-item"><ShieldCheck size={16} /><span>DNS & Well-Known Verification</span></div>
          <div className="home-spec-item"><Radio size={16} /><span>Zero-Polling SSE Telemetry</span></div>
          <div className="home-spec-item"><Layers size={16} /><span>Configurable Workload Curves</span></div>
          <div className="home-spec-item"><Server size={16} /><span>PostgreSQL Multi-Tenant Isolation</span></div>
        </div>
      </section>

      {/* 2. Interactive Telemetry Live Preview */}
      <section className="home-preview-card">
        <div className="preview-top">
          <div className="preview-title">
            <Activity size={18} style={{ color: 'var(--blue)' }} />
            <span>Target: <b>https://api.gateway.internal/v1/orders</b></span>
            <span className="env-pill">Production</span>
          </div>
          <div className="preview-status">
            <span className="status-dot" />
            <span>RUNNING (Stage 2: Peak Concurrency)</span>
          </div>
        </div>

        <div className="preview-metrics-grid">
          <div className="preview-metric-box">
            <small>Current Throughput</small>
            <b>{simRps} <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400 }}>req/s</span></b>
          </div>
          <div className="preview-metric-box">
            <small>Completed Requests</small>
            <b>8,412</b>
          </div>
          <div className="preview-metric-box">
            <small>p95 Latency</small>
            <b>{simP95} <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400 }}>ms</span></b>
          </div>
          <div className="preview-metric-box">
            <small>Error Rate</small>
            <b style={{ color: 'var(--green)' }}>0.00%</b>
          </div>
        </div>

        <div className="preview-progress-wrap">
          <div className="preview-progress-labels">
            <span>Staged Workload: 10 VUs Ramp-Up → 15 VUs Sustained → 0 VUs Ramp-Down</span>
            <span>{simProgress}% Completed (18s / 25s)</span>
          </div>
          <div className="preview-bar-track">
            <div className="preview-bar-fill" style={{ width: `${simProgress}%` }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '11px', color: 'var(--muted)' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>p50: <b style={{ color: 'var(--text)' }}>7.4 ms</b></span>
            <span>p90: <b style={{ color: 'var(--text)' }}>14.8 ms</b></span>
            <span>p95: <b style={{ color: 'var(--text)' }}>{simP95} ms</b></span>
            <span>p99: <b style={{ color: 'var(--text)' }}>29.5 ms</b></span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="status-pill completed"><i /> 200 OK: 8,412</span>
            <span className="status-pill"><i /> 429 Limited: 0</span>
          </div>
        </div>
      </section>

      {/* 3. Core Capabilities & Architectural Pillars */}
      <section id="features" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="home-section-header">
          <div className="eyebrow"><span className="eyebrow-line" /> CORE CAPABILITIES</div>
          <h2>Engineered for Reliability, Safety & Performance</h2>
          <p>
            Traditional load testing tools often fail at safety: they expose host processes to SSRF, leak authorization headers, and crash under heavy thread contention. DevFlow ServerTest is built from the ground up to prevent these pitfalls.
          </p>
        </div>

        <div className="home-grid-3">
          <div className="home-card">
            <div className="home-card-icon"><Layers size={20} /></div>
            <h3>Staged Workload Curves</h3>
            <p>
              Build realistic multi-stage traffic curves including ramp-up, steady-state, and cool-down with granular per-second virtual user interpolation.
            </p>
          </div>

          <div className="home-card">
            <div className="home-card-icon"><Radio size={20} /></div>
            <h3>Real-Time SSE Telemetry</h3>
            <p>
              Direct Server-Sent Events push live throughput, percentiles, and errors straight to your dashboard with zero client-side polling or API latency.
            </p>
          </div>

          <div className="home-card">
            <div className="home-card-icon"><ShieldCheck size={20} /></div>
            <h3>Target Ownership Verification</h3>
            <p>
              Enforce cryptographic verification before load-testing non-local targets via DNS TXT records or HTTP <code>.well-known</code> challenge probes.
            </p>
          </div>

          <div className="home-card">
            <div className="home-card-icon"><Zap size={20} /></div>
            <h3>Anti-SSRF Security Shield</h3>
            <p>
              Pre-flight DNS validation blocks private IP ranges (RFC1918), loopback, link-local, and AWS/GCP cloud metadata endpoints (169.254.169.254).
            </p>
          </div>

          <div className="home-card">
            <div className="home-card-icon"><Code2 size={20} /></div>
            <h3>Custom Request Builder & Redaction</h3>
            <p>
              Test GET, POST, PUT, DELETE with custom headers and 64KB JSON bodies. Sensitive authorization and cookie tokens are automatically redacted in storage.
            </p>
          </div>

          <div className="home-card">
            <div className="home-card-icon"><Server size={20} /></div>
            <h3>PostgreSQL & Tenant Isolation</h3>
            <p>
              Multi-tenant architecture powered by PostgreSQL with version-controlled migrations, bcrypt hashing, and strict resource isolation per user.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Three-Step Workflow */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="home-section-header">
          <div className="eyebrow"><span className="eyebrow-line" /> HOW IT WORKS</div>
          <h2>From Zero to High-Throughput Benchmarks in Minutes</h2>
        </div>

        <div className="home-grid-3">
          <div className="workflow-step-card">
            <div className="workflow-step-num">01</div>
            <h3 style={{ margin: '0', fontSize: '13px' }}>Register & Verify Target</h3>
            <p style={{ margin: '0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6' }}>
              Add your API endpoint URL. DevFlow generates a unique challenge token. Verify ownership via DNS TXT record or serving a challenge text file.
            </p>
          </div>

          <div className="workflow-step-card">
            <div className="workflow-step-num">02</div>
            <h3 style={{ margin: '0', fontSize: '13px' }}>Configure Workload Stages</h3>
            <p style={{ margin: '0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6' }}>
              Select HTTP methods (POST, PUT, GET), specify custom headers or payload bodies, and configure virtual user stages to model production traffic spikes.
            </p>
          </div>

          <div className="workflow-step-card">
            <div className="workflow-step-num">03</div>
            <h3 style={{ margin: '0', fontSize: '13px' }}>Observe Telemetry & Export</h3>
            <p style={{ margin: '0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6' }}>
              Watch live percentiles and error rates stream over SSE. Access historical test comparisons, verify degradation points, and export raw summaries.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Platform Comparison Table */}
      <section id="architecture" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="home-section-header">
          <div className="eyebrow"><span className="eyebrow-line" /> COMPARISON</div>
          <h2>Why DevFlow ServerTest?</h2>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table className="home-table">
            <thead>
              <tr>
                <th>Feature / Capability</th>
                <th>DevFlow ServerTest</th>
                <th>Traditional Cloud SaaS</th>
                <th>Ad-Hoc Bash Scripts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Live Telemetry Streaming</b></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Real-Time SSE</span></td>
                <td><span className="badge-x"><X size={14} /> Polled / Delayed</span></td>
                <td><span className="badge-x"><X size={14} /> Terminal Logs Only</span></td>
              </tr>
              <tr>
                <td><b>Anti-SSRF Target Protection</b></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Cryptographic Challenge</span></td>
                <td><span className="badge-x"><X size={14} /> Manual / None</span></td>
                <td><span className="badge-x"><X size={14} /> None (Unrestricted)</span></td>
              </tr>
              <tr>
                <td><b>Process Isolation</b></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Sandboxed Worker Child</span></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Remote Cloud Node</span></td>
                <td><span className="badge-x"><X size={14} /> Blocks Local Thread</span></td>
              </tr>
              <tr>
                <td><b>Automated Credential Redaction</b></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Yes (Storage & Audits)</span></td>
                <td><span className="badge-x"><X size={14} /> Partial</span></td>
                <td><span className="badge-x"><X size={14} /> Leaks in bash history</span></td>
              </tr>
              <tr>
                <td><b>Multi-Tenant Database Persistence</b></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> PostgreSQL + JWT</span></td>
                <td><span className="badge-check"><CheckCircle2 size={14} /> Expensive Seat Tiers</span></td>
                <td><span className="badge-x"><X size={14} /> None</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Call To Action Banner */}
      <section className="home-cta-banner">
        <div>
          <h2>Ready to Stress-Test Your Systems?</h2>
          <p>
            Deploy controlled workloads against authorized targets with k6 accuracy, complete target isolation, and sub-millisecond SSE telemetry.
          </p>
        </div>
        <button className="button primary hero-btn" onClick={onStart}>
          {user ? 'Go to Workspace' : 'Get Started Free'} <ArrowUpRight size={16} />
        </button>
      </section>
    </div>
  );
}
