import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, Plus, RefreshCw, X, Zap } from 'lucide-react';
import './index.css';

// Types
import { User, Target, Stage, Run, ThemeMode, LiveMetrics } from './types/index.ts';

// Layout & UI Components
import { AppSidebar } from './components/layout/AppSidebar.tsx';
import { AppTopBar } from './components/layout/AppTopBar.tsx';
import { HomeNavbar } from './components/layout/HomeNavbar.tsx';
import { Button } from './components/ui/Button.tsx';

// Modals
import { AuthModal } from './components/modals/AuthModal.tsx';
import { TargetModal } from './components/modals/TargetModal.tsx';
import { TargetVerifyModal } from './components/modals/TargetVerifyModal.tsx';
import { TestConfigModal } from './components/modals/TestConfigModal.tsx';
import { RunDetailsModal } from './components/modals/RunDetailsModal.tsx';

// Views
import { HomeView } from './components/views/HomeView.tsx';
import { OverviewView } from './components/views/OverviewView.tsx';
import { TargetsView } from './components/views/TargetsView.tsx';
import { TestRunsView } from './components/views/TestRunsView.tsx';
import { AnalysisView } from './components/views/AnalysisView.tsx';
import { ReportsView } from './components/views/ReportsView.tsx';
import { ComparisonsView } from './components/views/ComparisonsView.tsx';
import { DocsView } from './components/views/DocsView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { LiveMetricsView } from './components/views/LiveMetricsView.tsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n || 0);

// Demo Seed Data for Immediate Interactivity & Zero Blank States
const DEMO_USER: User = {
  id: 'usr_demo_lead',
  email: 'alex.mercer@devflow.internal',
  name: 'Alex Mercer',
  role: 'admin',
};

const DEFAULT_TARGETS: Target[] = [
  {
    id: 'tgt_checkout_prod',
    name: 'Payment & Checkout Gateway',
    isDemo: true,
    url: 'https://api.gateway.internal/v1/checkout',
    environment: 'Production',
    verified: true,
    verificationMethod: 'dns',
    verifiedAt: '2026-10-28T14:32:00Z',
    createdAt: '2026-10-28T14:00:00Z',
  },
  {
    id: 'tgt_users_staging',
    name: 'User Directory API',
    isDemo: true,
    url: 'https://staging.internal/api/v2/users',
    environment: 'Staging',
    verified: true,
    verificationMethod: 'dns',
    verifiedAt: '2026-10-30T09:15:00Z',
    createdAt: '2026-10-30T09:00:00Z',
  },
  {
    id: 'tgt_local_dev',
    name: 'Local Microservice (dev)',
    isDemo: true,
    url: 'http://localhost:3001/health',
    environment: 'Development',
    verified: true,
    createdAt: '2026-11-01T08:00:00Z',
  },
];

const DEFAULT_RUNS: Run[] = [
  {
    id: 'run_9f4a10',
    targetId: 'tgt_checkout_prod',
    targetName: 'Payment & Checkout Gateway (Demo data)',
    url: 'https://api.gateway.internal/v1/checkout',
    method: 'POST',
    concurrency: 50,
    durationSec: 30,
    profile: 'stages',
    status: 'completed',
    isDemo: true,
    startedAt: '2026-11-01T08:14:00Z',
    finishedAt: '2026-11-01T08:14:30Z',
    totalRequests: 85200,
    successCount: 85200,
    failedCount: 0,
    rps: 2840,
    p50: 8.3,
    p95: 18.4,
    p99: 29.4,
    errorRate: 0.00,
    statusCodes: { '200': 85200 },
  },
  {
    id: 'run_8e3b21',
    targetId: 'tgt_users_staging',
    targetName: 'User Directory API (Demo data)',
    url: 'https://staging.internal/api/v2/users',
    method: 'GET',
    concurrency: 25,
    durationSec: 20,
    profile: 'fixed',
    status: 'completed',
    isDemo: true,
    startedAt: '2026-11-01T07:45:00Z',
    finishedAt: '2026-11-01T07:45:20Z',
    totalRequests: 42100,
    successCount: 42080,
    failedCount: 20,
    httpErrorCount: 20,
    rps: 2105,
    p50: 12.1,
    p95: 22.8,
    p99: 41.5,
    errorRate: 0.0475,
    statusCodes: { '200': 42080, '504': 20 },
  },
  {
    id: 'run_7d2c33',
    targetId: 'tgt_local_dev',
    targetName: 'Local Microservice (dev) (Demo data)',
    url: 'http://localhost:3001/health',
    method: 'GET',
    concurrency: 10,
    durationSec: 15,
    profile: 'fixed',
    status: 'completed',
    isDemo: true,
    startedAt: '2026-11-01T06:30:00Z',
    finishedAt: '2026-11-01T06:30:15Z',
    totalRequests: 19500,
    successCount: 19500,
    failedCount: 0,
    rps: 1300,
    p50: 4.2,
    p95: 9.8,
    p99: 14.1,
    errorRate: 0.00,
    statusCodes: { '200': 19500 },
  },
];

// Bidirectional URL Route Mappings
const ROUTE_MAP: Record<string, string> = {
  '': 'Home',
  '/': 'Home',
  'home': 'Home',
  'overview': 'Overview',
  'dashboard': 'Overview',
  'targets': 'API Targets',
  'servers': 'API Targets',
  'api-targets': 'API Targets',
  'runs': 'Test Runs',
  'tests': 'Test Runs',
  'test-runs': 'Test Runs',
  'live': 'Live Metrics',
  'metrics': 'Live Metrics',
  'history': 'History',
  'reports': 'History',
  'analysis': 'Performance Analysis',
  'comparisons': 'Comparisons',
  'docs': 'Documentation',
  'documentation': 'Documentation',
  'settings': 'Settings',
};

const PAGE_TO_HASH: Record<string, string> = {
  'Home': '/',
  'Overview': '/overview',
  'API Targets': '/targets',
  'Servers & Targets': '/targets',
  'Test Runs': '/runs',
  'Live Metrics': '/live',
  'History': '/history',
  'Reports': '/history',
  'Performance Analysis': '/analysis',
  'Comparisons': '/comparisons',
  'Documentation': '/docs',
  'Settings': '/settings',
};

function getInitialPage(): string {
  if (typeof window === 'undefined') return 'Home';
  const searchParams = new URLSearchParams(window.location.search);
  const q = searchParams.get('page');
  if (q && ROUTE_MAP[q.toLowerCase()]) return ROUTE_MAP[q.toLowerCase()];

  const rawHash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
  if (rawHash && ROUTE_MAP[rawHash]) return ROUTE_MAP[rawHash];

  return 'Home';
}

function getInitialAuth(): { show: boolean; mode: 'login' | 'register' } {
  if (typeof window === 'undefined') return { show: false, mode: 'login' };
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('auth') === 'true') return { show: true, mode: 'login' };

  const rawHash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
  if (rawHash === 'login' || rawHash === 'signin') return { show: true, mode: 'login' };
  if (rawHash === 'signup' || rawHash === 'register') return { show: true, mode: 'register' };

  return { show: false, mode: 'login' };
}

export default function App() {
  const initialAuth = useMemo(() => getInitialAuth(), []);
  const [page, setPage] = useState<string>(() => getInitialPage());
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem('servertest-theme') as ThemeMode) || 'dark'
  );
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('servertest-token'));
  const [user, setUser] = useState<User | null>(() => {
    const savedDemo = localStorage.getItem('servertest-demo-mode');
    return savedDemo === 'true' ? DEMO_USER : null;
  });

  const [showAuth, setShowAuth] = useState<boolean>(() => initialAuth.show);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => initialAuth.mode);
  const [socialPrompt, setSocialPrompt] = useState<'github' | 'google' | null>(null);
  const [socialEmail, setSocialEmail] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  // Operational State
  const [targets, setTargets] = useState<Target[]>(() => localStorage.getItem('servertest-demo-mode') === 'true' ? DEFAULT_TARGETS : []);
  const [runs, setRuns] = useState<Run[]>(() => localStorage.getItem('servertest-demo-mode') === 'true' ? DEFAULT_RUNS : []);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [notice, setNotice] = useState('');
  const [targetError, setTargetError] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);
  const [testError, setTestError] = useState('');
  const [showTarget, setShowTarget] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('target_modal') === 'true');
  const [showTest, setShowTest] = useState(() => typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('test_modal') === 'true' || window.location.hash.includes('test_modal')));
  const [verifyingTarget, setVerifyingTarget] = useState<Target | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({});
  const [query, setQuery] = useState('');

  // Target creation form
  const [targetName, setTargetName] = useState('Local latency demo');
  const [targetUrl, setTargetUrl] = useState('http://127.0.0.1:5050');
  const [environment, setEnvironment] = useState('Development');

  // Test configuration form
  const [testTarget, setTestTarget] = useState('');
  const [path, setPath] = useState('/slow?ms=50');
  const [method, setMethod] = useState('GET');
  const [concurrency, setConcurrency] = useState(5);
  const [duration, setDuration] = useState(5);
  const [testProfile, setTestProfile] = useState<'fixed' | 'stages'>('fixed');
  const [stages, setStages] = useState<Stage[]>([
    { target: 5, durationSec: 5 },
    { target: 15, durationSec: 10 },
    { target: 0, durationSec: 5 },
  ]);
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [workerCount, setWorkerCount] = useState<number>(1);
  const [timeoutMs, setTimeoutMs] = useState(5000);
  const [authorized, setAuthorized] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  // Synchronize Hash Routing with Browser Back/Forward & Direct URLs
  useEffect(() => {
    const handleHashSync = () => {
      const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const q = searchParams?.get('page');
      const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '').toLowerCase().trim() : '';

      if (raw === 'login' || raw === 'signin' || searchParams?.get('auth') === 'true') {
        setAuthMode('login');
        setShowAuth(true);
        return;
      }
      if (raw === 'signup' || raw === 'register') {
        setAuthMode('register');
        setShowAuth(true);
        return;
      }
      if (raw && ROUTE_MAP[raw]) {
        setPage(ROUTE_MAP[raw]);
        return;
      }
      if (q && ROUTE_MAP[q.toLowerCase()]) {
        setPage(ROUTE_MAP[q.toLowerCase()]);
        return;
      }
      setPage('Home');
    };

    handleHashSync();
    window.addEventListener('hashchange', handleHashSync);
    return () => window.removeEventListener('hashchange', handleHashSync);
  }, []);

  // Theme synchronization: dark, light, system
  useEffect(() => {
    localStorage.setItem('servertest-theme', theme);
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  // Navigate function with URL Hash update
  function navigateTo(targetPage: string, updateHash = true) {
    if (targetPage === 'Login') {
      setAuthMode('login');
      setShowAuth(true);
      if (updateHash) window.location.hash = '/login';
      return;
    }
    if (targetPage === 'Register') {
      setAuthMode('register');
      setShowAuth(true);
      if (updateHash) window.location.hash = '/register';
      return;
    }
    if (targetPage === 'Create Test') {
      if (targets.length) {
        setTestTarget(targets[0].id);
      }
      setShowTest(true);
      return;
    }

    if (targetPage === 'Live Metrics') {
      if (!selectedRun) {
        const active = runs.find((r) => ['running', 'queued', 'validating'].includes(r.status));
        if (active) setSelectedRun(active);
        else if (runs.length > 0) setSelectedRun(runs[0]);
      }
    }

    setPage(targetPage);
    if (updateHash) {
      const h = PAGE_TO_HASH[targetPage] || '/';
      if (window.location.hash !== `#${h}`) {
        window.location.hash = h;
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Network request wrapper with safe offline handling
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
      if (r.status === 401 && !['/auth/login', '/auth/register', '/auth/oauth'].includes(route)) {
        localStorage.removeItem('servertest-token');
        localStorage.removeItem('servertest-demo-mode');
        setToken(null);
        setUser(null);
        setTargets([]);
        setRuns([]);
        setSelectedRun(null);
        setNotice('Session expired. Running in local preview mode.');
      }
      throw new Error(body.error || `Request failed (${r.status})`);
    }
    return body;
  }

  // Refresh server data when token is present
  async function refresh() {
    if (!token) { setDataError('Sign in to load your saved targets and test runs.'); return; }
    setLoading(true);
    try {
      const [t, r] = await Promise.all([request<Target[]>('/targets'), request<Run[]>('/runs')]);
      const loadedTargets = Array.isArray(t) ? t : [];
      setTargets(loadedTargets);
      setTestTarget((previous) => previous && loadedTargets.some((target) => target.id === previous) ? previous : loadedTargets[0]?.id || '');
      setRuns(Array.isArray(r) ? r : []);
      setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'Could not load workspace data.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (token) {
      request<{ user: User }>('/auth/me')
        .then((res) => {
          setUser(res.user);
          refresh();
        })
        .catch((error) => { setDataError(error instanceof Error ? error.message : 'Could not validate your session.'); });
    }
  }, [token]);

  // Real or Simulated SSE listener for active test runs
  useEffect(() => {
    if (!selectedRun) return;
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(selectedRun.status)) {
      setLiveMetrics({});
      return;
    }

    if (token) {
      let cancelled = false;
      let eventSource: EventSource | null = null;
      request<{ ticket: string }>(`/runs/${selectedRun.id}/events-ticket`, { method: 'POST' })
        .then(({ ticket }) => {
          if (cancelled) return;
          const sseUrl = `${API}/runs/${selectedRun.id}/events?ticket=${encodeURIComponent(ticket)}`;
          eventSource = new EventSource(sseUrl);

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
              setSelectedRun((prev) => (prev ? { ...prev, ...data } : null));
            } catch {}
          });

          eventSource.addEventListener('end', (e) => {
            let eventData: Partial<Run> = {};
            try {
              eventData = JSON.parse(e.data);
              setSelectedRun((prev) => prev ? { ...prev, ...eventData } : null);
            } catch {}
            eventSource?.close();
            void Promise.all([
              refresh(),
              request<Run>(`/runs/${selectedRun.id}`).then((savedRun) => {
                setSelectedRun((prev) => prev?.id === savedRun.id ? savedRun : prev);
              }).catch((error) => {
                setNotice(error instanceof Error ? `Run ended, but its saved results could not be reloaded: ${error.message}` : 'Run ended, but its saved results could not be reloaded.');
              }),
            ]);
          });

          eventSource.onerror = () => eventSource?.close();
        })
        .catch((error) => {
          if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not connect to live run metrics.');
        });

      return () => {
        cancelled = true;
        eventSource?.close();
      };
    }
  }, [selectedRun?.id, token]);

  // 1-Click Instant Demo Authentication
  function handleDemoAuth() {
    localStorage.removeItem('servertest-token');
    setToken(null);
    setUser(DEMO_USER);
    localStorage.setItem('servertest-demo-mode', 'true');
    setShowAuth(false);
    setNotice('Welcome Alex! You are now operating the ServerTest Developer Workspace.');
    navigateTo('Overview');
  }

  // Email / Password Authentication
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
        localStorage.removeItem('servertest-demo-mode');
        localStorage.setItem('servertest-token', res.token);
        setToken(res.token);
        setUser(res.user);
        setShowAuth(false);
        setNotice(`Welcome to ServerTest, ${res.user.name}!`);
        navigateTo('Overview');
      } else {
        const res = await request<{ user: User; token: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword }),
        });
        localStorage.removeItem('servertest-demo-mode');
        localStorage.setItem('servertest-token', res.token);
        setToken(res.token);
        setUser(res.user);
        setShowAuth(false);
        setNotice(`Welcome back, ${res.user.name}!`);
        navigateTo('Overview');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed. Check the API connection and try again.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Social 1-Click Authentication
  async function handleSocialAuth(provider: 'github' | 'google', customEmail?: string) {
    setAuthSubmitting(true);
    setAuthError('');
    const emailToUse = customEmail || socialEmail || (provider === 'github' ? 'developer@github.com' : 'developer@gmail.com');
    const defaultName = provider === 'github' ? 'GitHub Developer' : 'Google Developer';

    try {
      const res = await request<{ user: User; token: string }>('/auth/oauth', {
        method: 'POST',
        body: JSON.stringify({ provider, email: emailToUse.trim(), name: defaultName }),
      });
      localStorage.removeItem('servertest-demo-mode');
      localStorage.setItem('servertest-token', res.token);
      setToken(res.token);
      setUser(res.user);
      setShowAuth(false);
      setNotice(`Signed in with ${provider === 'github' ? 'GitHub' : 'Google'} as ${res.user.email}`);
      navigateTo('Overview');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Provider sign in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleLogout() {
    if (token) {
      request('/auth/logout', { method: 'POST' }).catch(() => {});
    }
    localStorage.removeItem('servertest-token');
    localStorage.removeItem('servertest-demo-mode');
    setToken(null);
    setUser(null);
    setTargets([]);
    setRuns([]);
    setSelectedRun(null);
    navigateTo('Home');
    setNotice('You have been signed out.');
  }

  const activeRuns = runs.filter((r) => ['running', 'queued', 'validating'].includes(r.status));
  const completed = runs.filter((r) => r.status === 'completed');
  const latest = completed[0];

  // Target creation
  async function addTarget(e: React.FormEvent) {
    e.preventDefault();
    setTargetError('');
    if (!token) {
      setTargetError(user ? 'The demo workspace is read-only. Create or sign in to an account to save targets.' : 'Sign in or create an account before saving a target.');
      return;
    }
    setTargetSaving(true);
    try {
      const t = await request<Target>('/targets', {
        method: 'POST',
        body: JSON.stringify({ name: targetName, url: targetUrl, environment }),
      });
      setTargets((p) => [t, ...p]);
      setTestTarget(t.id);
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : 'Could not save target.');
      return;
    } finally {
      setTargetSaving(false);
    }

    setShowTarget(false);
    setNotice(`Target "${targetName}" saved successfully.`);
    setTargetName('Local latency demo');
    setTargetUrl('http://127.0.0.1:5050');
  }

  async function verifyDomain(targetId: string) {
    setVerifyLoading(true);
    try {
      const result = await request<{ target?: Target; verified?: boolean; error?: string }>(`/targets/${targetId}/verify`, { method: 'POST' });
      if (result.target) setTargets((p) => p.map((t) => t.id === targetId ? result.target! : t));
      else await refresh();
      setVerifyingTarget(null);
      setNotice('Domain ownership proof verified successfully!');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Domain verification failed.'); }
    finally { setVerifyLoading(false); }
  }

  async function launchTest(e: React.FormEvent) {
    e.preventDefault();
    setTestError('');
    if (!token) {
      setTestError(user ? 'The demo workspace is read-only. Sign in to an account to run tests.' : 'Sign in to run tests against your saved targets.');
      return;
    }
    setStarting(true);
    const t = targets.find((x) => x.id === testTarget) || targets[0];
    if (!t) {
      setTestError('Please select an authorized API target.');
      setStarting(false);
      return;
    }

    const headers: Record<string, string> = {};
    if (headersText.trim()) {
      headersText.split('\n').forEach((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const k = line.slice(0, colonIdx).trim();
          const v = line.slice(colonIdx + 1).trim();
          if (k && v) headers[k] = v;
        }
      });
    }

    const payload: any = {
      targetId: t.id,
      path,
      method,
      authorized: true,
      headers,
      timeoutMs,
      concurrency,
      durationSec: duration,
      profile: testProfile,
      workerCount,
    };

    if (testProfile === 'stages') {
      payload.stages = stages;
    }
    if (bodyText.trim() && ['POST', 'PUT', 'PATCH'].includes(method)) {
      payload.body = bodyText.trim();
    }

    try {
      const run = await request<Run>('/runs', { method: 'POST', body: JSON.stringify(payload) });
      setRuns((p) => [run, ...p]);
      setShowTest(false);
      setSelectedRun(run);
      navigateTo('Test Runs');
      setNotice('Test queued. Live metrics streaming via SSE.');
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Could not start test. Check the API connection.');
    } finally {
      setStarting(false);
    }
  }

  async function stopRun(id: string) {
    let response: { requested: boolean; status: string };
    try {
      response = await request<{ requested: boolean; status: string }>(`/runs/${id}/cancel`, { method: 'POST' });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not cancel test.'); return; }
    try {
      const savedRun = await request<Run>(`/runs/${id}`);
      setRuns((prev) => prev.map((run) => run.id === id ? savedRun : run));
      setSelectedRun((prev) => prev?.id === id ? savedRun : prev);
    } catch (error) {
      setNotice(error instanceof Error ? `Cancellation was requested, but run status could not be reloaded: ${error.message}` : 'Cancellation was requested, but run status could not be reloaded.');
      return;
    }
    setNotice(response.status === 'cancelled' ? `Test ${id} was cancelled.` : `Cancellation requested for test ${id}. The worker is stopping.`);
  }

  function exportRun(run: Run) {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(run, null, 2))}`;
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `servertest-run-${run.id}.json`;
    a.click();
  }

  async function deleteTarget(id: string) {
    try {
      await request(`/targets/${id}`, { method: 'DELETE' });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete target.'); return; }
    setTargets((p) => p.filter((t) => t.id !== id));
    setNotice('Target removed from platform.');
  }

  const visibleRuns = useMemo(() => {
    return runs.filter(
      (r) =>
        r.id.toLowerCase().includes(query.toLowerCase()) ||
        r.targetName.toLowerCase().includes(query.toLowerCase()) ||
        r.url.toLowerCase().includes(query.toLowerCase()) ||
        r.method.toLowerCase().includes(query.toLowerCase()) ||
        r.status.toLowerCase().includes(query.toLowerCase())
    );
  }, [runs, query]);

  // Modal Overlays
  const modalElements = (
    <>
      {showAuth && (
        <AuthModal
          authMode={authMode}
          setAuthMode={setAuthMode}
          authName={authName}
          setAuthName={setAuthName}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authSubmitting={authSubmitting}
          authError={authError}
          setAuthError={setAuthError}
          socialPrompt={socialPrompt}
          setSocialPrompt={setSocialPrompt}
          socialEmail={socialEmail}
          setSocialEmail={setSocialEmail}
          handleAuth={handleAuth}
          handleSocialAuth={handleSocialAuth}
          handleDemoAuth={handleDemoAuth}
          onClose={() => {
            setShowAuth(false);
            if (window.location.hash === '#/login' || window.location.hash === '#/register') {
              window.location.hash = PAGE_TO_HASH[page] || '/';
            }
          }}
        />
      )}

      {showTarget && (
        <TargetModal
          targetName={targetName}
          setTargetName={setTargetName}
          targetUrl={targetUrl}
          setTargetUrl={setTargetUrl}
          environment={environment}
          setEnvironment={setEnvironment}
          addTarget={addTarget}
          saving={targetSaving}
          error={targetError}
          canSave={Boolean(token)}
          onSignIn={() => { setShowTarget(false); setAuthMode('login'); setAuthError(''); setShowAuth(true); }}
          onClose={() => setShowTarget(false)}
        />
      )}

      {verifyingTarget && (
        <TargetVerifyModal
          target={verifyingTarget}
          verifyLoading={verifyLoading}
          verifyDomain={verifyDomain}
          onClose={() => setVerifyingTarget(null)}
        />
      )}

      {showTest && (
        <TestConfigModal
          testTarget={testTarget}
          setTestTarget={setTestTarget}
          path={path}
          setPath={setPath}
          method={method}
          setMethod={setMethod}
          concurrency={concurrency}
          setConcurrency={setConcurrency}
          duration={duration}
          setDuration={setDuration}
          testProfile={testProfile}
          setTestProfile={setTestProfile}
          stages={stages}
          setStages={setStages}
          headersText={headersText}
          setHeadersText={setHeadersText}
          bodyText={bodyText}
          setBodyText={setBodyText}
          workerCount={workerCount}
          setWorkerCount={setWorkerCount}
          timeoutMs={timeoutMs}
          setTimeoutMs={setTimeoutMs}
          authorized={authorized}
          setAuthorized={setAuthorized}
          starting={starting}
          error={testError}
          canRun={Boolean(token)}
          launchTest={launchTest}
          targets={targets}
          onAddTarget={() => {
            setShowTest(false);
            if (token) { setTargetError(''); setShowTarget(true); }
            else { setAuthMode('login'); setAuthError('Sign in or create an account to save targets and run tests.'); setShowAuth(true); }
          }}
          onClose={() => setShowTest(false)}
        />
      )}

      {selectedRun && (
        <RunDetailsModal
          selectedRun={selectedRun}
          liveMetrics={liveMetrics}
          stopRun={stopRun}
          exportRun={exportRun}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </>
  );

  // 1. PUBLIC LANDING PAGE (No Sidebar, Horizontal Navbar, Aurora Wave)
  if (page === 'Home') {
    return (
      <div className="landing-shell">
        <HomeNavbar
          theme={theme}
          onThemeChange={setTheme}
          user={user}
          onSignInClick={() => navigateTo('Login')}
          onStartClick={() => navigateTo('Overview')}
          onNavigate={(target) => navigateTo(target)}
        />

        <HomeView
          onStart={() => navigateTo('Overview')}
          onLaunchTest={() => navigateTo('Create Test')}
          user={user}
          onNavigateDocs={() => navigateTo('Documentation')}
          onNavigatePage={(p) => navigateTo(p)}
        />

        {modalElements}
      </div>
    );
  }

  // 2. AUTHENTICATED DASHBOARD LAYOUT (Sleek Sidebar & Topbar)
  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <AppSidebar
        currentPage={page}
        onNavigate={(p) => navigateTo(p)}
        user={user}
        activeRunsCount={activeRuns.length}
        mobileOpen={mobileNav}
        onMobileClose={() => setMobileNav(false)}
        onNewTestClick={() => navigateTo('Create Test')}
        connectionStatus={token ? (dataError ? 'Issue' : loading ? 'Loading' : 'Connected') : user ? 'Demo' : 'Offline'}
      />

      {/* Main Content Area */}
      <main className="main-area">
        {/* Sticky Topbar */}
        <AppTopBar
          currentPage={page}
          theme={theme}
          onThemeChange={setTheme}
          user={user}
          onSignInClick={() => navigateTo('Login')}
          onLogoutClick={handleLogout}
          onNavigate={(p) => navigateTo(p)}
          onMobileToggle={() => setMobileNav(true)}
          onNewTestClick={() => navigateTo('Create Test')}
        />

        <div className="content">
          {/* Dismissible Notice */}
          {notice && (
            <div className="notice">
              <CircleHelp size={16} />
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice('')}
                aria-label="Dismiss notice"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {(loading || dataError) && <div className={`notice ${dataError ? 'notice-error' : ''}`} role="status">{loading ? 'Loading workspace data…' : dataError}</div>}

          {/* Page Heading for Dashboard Views */}
          <div className="page-heading">
            <div>
              <h1>
                {page === 'Overview'
                  ? 'Overview'
                  : page === 'API Targets' || page === 'Servers & Targets'
                  ? 'API Targets'
                  : page === 'Test Runs'
                  ? 'Test Runs'
                  : page === 'Live Metrics'
                  ? 'Live Metrics'
                  : page === 'History'
                  ? 'Test History & Reports'
                  : page}
              </h1>
              <p>
                {page === 'Overview'
                  ? 'Run load tests, observe real-time metrics, and inspect API reliability.'
                  : page === 'API Targets' || page === 'Servers & Targets'
                  ? 'Manage authorized target endpoints and cryptographic ownership proofs.'
                  : page === 'Test Runs'
                  ? 'Track test executions, inspect response times, and stream live SSE telemetry.'
                  : page === 'Live Metrics'
                  ? 'Real-time telemetry streaming over Server-Sent Events.'
                  : page === 'History'
                  ? 'Durable performance snapshots and execution comparisons.'
                  : 'A modern developer platform for repeatable performance benchmarks.'}
              </p>
            </div>
            <div className="heading-actions" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={refresh}
                title="Refresh metrics from backend"
              >
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigateTo('Create Test')}
              >
                <Plus size={14} />
                <span>Run Test</span>
              </button>
            </div>
          </div>

          {/* Page Views */}
          {page === 'Overview' && (
            <OverviewView
              targets={targets}
              runs={runs}
              completed={completed}
              activeRuns={activeRuns}
              latest={latest}
              onNavigate={(p) => navigateTo(p)}
              onSelectRun={setSelectedRun}
              onShowTargetModal={() => setShowTarget(true)}
              onShowTestModal={() => setShowTest(true)}
              onSimulateRun={undefined}
              setTestTarget={setTestTarget}
              fmt={fmt}
            />
          )}

          {(page === 'API Targets' || page === 'Servers & Targets') && (
            <TargetsView
              targets={targets}
              onShowTargetModal={() => setShowTarget(true)}
              onVerifyTarget={setVerifyingTarget}
              onDeleteTarget={deleteTarget}
            />
          )}

          {page === 'Live Metrics' && (
            <LiveMetricsView
              runs={runs}
              selectedRun={selectedRun}
              onSelectRun={setSelectedRun}
              liveMetrics={liveMetrics}
              onStopRun={stopRun}
              onNewTestClick={() => navigateTo('Create Test')}
              onSimulateRun={undefined}
              fmt={fmt}
            />
          )}

          {page === 'Test Runs' && (
            <TestRunsView
              runs={runs}
              query={query}
              setQuery={setQuery}
              visibleRuns={visibleRuns}
              onSelectRun={setSelectedRun}
              onStopRun={stopRun}
              onCreateTestClick={() => {
                if (targets.length) {
                  setTestTarget(targets[0].id);
                  setShowTest(true);
                } else {
                  setShowTarget(true);
                }
              }}
              fmt={fmt}
            />
          )}

          {page === 'Performance Analysis' && (
            <AnalysisView completed={completed} fmt={fmt} />
          )}

          {(page === 'Reports' || page === 'History') && (
            <ReportsView completed={completed} exportRun={exportRun} fmt={fmt} />
          )}

          {page === 'Comparisons' && (
            <ComparisonsView completed={completed} token={token} />
          )}

          {page === 'Documentation' && <DocsView />}

          {page === 'Settings' && (
            <SettingsView
              user={user}
              theme={theme}
              setTheme={setTheme}
              handleLogout={handleLogout}
              setShowAuth={setShowAuth}
            />
          )}
        </div>
      </main>

      {modalElements}
    </div>
  );
}
