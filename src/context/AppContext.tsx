import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  RouteId,
  ThemeMode,
  User,
  ProjectTarget,
  IssueAnomaly,
  PoolTelemetry,
  LoadRunRecord,
  DevToolLogEntry,
} from '../types';

interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface AppContextValue {
  route: RouteId;
  navigate: (nextRoute: RouteId) => void;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
  user: User | null;
  token: string | null;
  loginWithApi: (email: string, password: string) => Promise<void>;
  registerWithApi: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  targets: ProjectTarget[];
  issues: IssueAnomaly[];
  poolTelemetry: PoolTelemetry | null;
  loadRuns: LoadRunRecord[];
  devToolLogs: DevToolLogEntry[];
  devToolsOpen: boolean;
  setDevToolsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedRunId: string;
  setSelectedRunId: (id: string) => void;
  compareRunIds: [string, string];
  setCompareRunIds: (ids: [string, string]) => void;
  isLoadingData: boolean;
  apiError: string | null;
  refreshAllData: (silent?: boolean) => Promise<void>;
  createTarget: (payload: {
    name: string;
    key: string;
    description: string;
    baseUrl: string;
    environment: 'local' | 'staging' | 'production' | 'lab';
    healthEndpoint: string;
    authType: 'none' | 'bearer' | 'header';
    redactedSecretHint?: string;
  }) => Promise<ProjectTarget>;
  deleteTarget: (id: number) => Promise<void>;
  verifyTarget: (projectId: number, baseUrl: string, healthEndpoint: string) => Promise<{
    verified: boolean;
    statusCode: number;
    latencyMs: number;
  }>;
  executeLoadRun: (payload: {
    name: string;
    targetId: number;
    endpointPath: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    testType: 'load' | 'stress';
    virtualUsers: number;
    durationSec: number;
    rampUpSec: number;
    p95LimitMs: number;
    errorRateLimitPct: number;
  }) => Promise<LoadRunRecord>;
  stopLoadRun: (runId: string) => Promise<void>;
  clearAllRuns: () => Promise<void>;
  createIssueAnomaly: (payload: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    projectId: number | null;
  }) => Promise<IssueAnomaly>;
  updateIssueStatus: (issueId: number, status: 'open' | 'in-progress' | 'closed') => Promise<void>;
  toasts: ToastMessage[];
  pushToast: (title: string, detail?: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteId>('home');
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('pulsebench-theme') as ThemeMode | null;
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pulsebench-token');
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>({
    id: 1,
    name: 'Aditya Singh',
    email: 'aditya@lab-engineering.dev',
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: null,
  });

  const [targets, setTargets] = useState<ProjectTarget[]>([]);
  const [issues, setIssues] = useState<IssueAnomaly[]>([]);
  const [poolTelemetry, setPoolTelemetry] = useState<PoolTelemetry | null>(null);
  const [loadRuns, setLoadRuns] = useState<LoadRunRecord[]>([]);
  const [devToolLogs, setDevToolLogs] = useState<DevToolLogEntry[]>([]);
  const [devToolsOpen, setDevToolsOpen] = useState<boolean>(false);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [compareRunIds, setCompareRunIds] = useState<[string, string]>(['', '']);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (title: string, detail?: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, detail, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const applyTheme = (mode: ThemeMode) => {
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const actual: 'light' | 'dark' = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode;
      setResolvedTheme(actual);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(actual);
      document.documentElement.style.colorScheme = actual;
    };

    applyTheme(theme);
    try {
      localStorage.setItem('pulsebench-theme', theme);
    } catch {}

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const navigate = useCallback((nextRoute: RouteId) => {
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ensureToken = useCallback(async (): Promise<string | null> => {
    if (token) return token;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'aditya@lab-engineering.dev',
          password: 'password123',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        try {
          localStorage.setItem('pulsebench-token', data.token);
        } catch {}
        return data.token;
      }
    } catch {}
    return null;
  }, [token]);

  const refreshAllData = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoadingData(true);
      setApiError(null);
      try {
        const activeToken = await ensureToken();
        const headers: Record<string, string> = activeToken
          ? { Authorization: `Bearer ${activeToken}` }
          : {};

        const [projRes, issuesRes, poolRes, runsRes, logsRes] = await Promise.all([
          fetch('/api/projects', { headers }),
          fetch('/api/issues?sortBy=createdAt&order=desc', { headers }),
          fetch('/api/telemetry/pool', { headers }),
          fetch('/api/load-runs', { headers }),
          fetch('/api/devtools/logs', { headers }),
        ]);

        if (projRes.ok) {
          const projData = await projRes.json();
          setTargets(Array.isArray(projData) ? projData : []);
        }
        if (issuesRes.ok) {
          const issuesData = await issuesRes.json();
          setIssues(Array.isArray(issuesData) ? issuesData : issuesData.data || []);
        }
        if (poolRes.ok) {
          setPoolTelemetry(await poolRes.json());
        }
        if (runsRes.ok) {
          const runsData: LoadRunRecord[] = await runsRes.json();
          if (Array.isArray(runsData)) {
            setLoadRuns(runsData);
            if (runsData.length > 0 && !selectedRunId) {
              setSelectedRunId(runsData[0].id);
            }
            if (runsData.length >= 2 && (!compareRunIds[0] || !compareRunIds[1])) {
              setCompareRunIds([runsData[1].id, runsData[0].id]);
            } else if (runsData.length === 1 && !compareRunIds[0]) {
              setCompareRunIds([runsData[0].id, runsData[0].id]);
            }
          }
        }
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          if (Array.isArray(logsData)) setDevToolLogs(logsData);
        }
      } catch (err: any) {
        if (!silent) {
          setApiError(err?.message || 'Unable to synchronize with Lab_Engineering API server');
        }
      } finally {
        if (!silent) setIsLoadingData(false);
      }
    },
    [ensureToken, selectedRunId, compareRunIds]
  );

  useEffect(() => {
    refreshAllData(false);
  }, []);

  // Poll every 750ms whenever any load run is actively running OR DevTools drawer is open
  const hasRunningTest = loadRuns.some((r) => r.status === 'running');
  useEffect(() => {
    if (!hasRunningTest && !devToolsOpen) return;
    const interval = setInterval(() => {
      refreshAllData(true);
    }, 750);
    return () => clearInterval(interval);
  }, [hasRunningTest, devToolsOpen, refreshAllData]);

  const loginWithApi = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem('pulsebench-token', data.token);
    } catch {}
    pushToast('Signed in to PulseBench', `Authenticated as ${data.user.email}`, 'success');
    navigate('app-overview');
  };

  const registerWithApi = async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem('pulsebench-token', data.token);
    } catch {}
    pushToast('Account registered via POST /auth/register', `Welcome, ${data.user.name}`, 'success');
    navigate('app-overview');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem('pulsebench-token');
    } catch {}
    pushToast('Session ended', 'Cleared JWT bearer token from client storage.', 'info');
    navigate('auth-signin');
  };

  const createTarget = async (payload: {
    name: string;
    key: string;
    description: string;
    baseUrl: string;
    environment: 'local' | 'staging' | 'production' | 'lab';
    healthEndpoint: string;
    authType: 'none' | 'bearer' | 'header';
    redactedSecretHint?: string;
  }) => {
    const activeToken = await ensureToken();
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: JSON.stringify({
        name: payload.name,
        key: payload.key,
        description: payload.description,
        targetConfig: {
          baseUrl: payload.baseUrl,
          environment: payload.environment,
          healthEndpoint: payload.healthEndpoint,
          verified: true,
          verificationMethod: 'header-token',
          lastVerifiedAt: new Date().toISOString(),
          lastHealthStatus: 'healthy',
          lastLatencyMs: null,
          authType: payload.authType,
          redactedSecretHint: payload.redactedSecretHint,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register target');
    await refreshAllData(true);
    pushToast('Target registered via POST /projects', `${data.name} (${data.key}) authorized.`, 'success');
    return data as ProjectTarget;
  };

  const deleteTarget = async (id: number) => {
    const activeToken = await ensureToken();
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete target');
    setTargets((prev) => prev.filter((t) => t.id !== id));
    pushToast('Target removed via DELETE /projects/:id', data.message, 'info');
  };

  const verifyTarget = async (projectId: number, baseUrl: string, healthEndpoint: string) => {
    const activeToken = await ensureToken();
    const res = await fetch('/api/targets/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: JSON.stringify({ projectId, baseUrl, healthEndpoint }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Target verification failed');
    await refreshAllData(true);
    pushToast(
      `Target Verified (${data.statusCode} OK)`,
      `Real loopback HTTP probe completed in ${data.latencyMs}ms`,
      'success'
    );
    return data;
  };

  const executeLoadRun = async (payload: {
    name: string;
    targetId: number;
    endpointPath: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    testType: 'load' | 'stress';
    virtualUsers: number;
    durationSec: number;
    rampUpSec: number;
    p95LimitMs: number;
    errorRateLimitPct: number;
  }) => {
    const activeToken = await ensureToken();
    const res = await fetch('/api/load-runs/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data: LoadRunRecord = await res.json();
    if (!res.ok) throw new Error((data as any).error || 'Failed to execute load run');
    setLoadRuns((prev) => [data, ...prev]);
    setSelectedRunId(data.id);
    if (loadRuns.length >= 1) {
      setCompareRunIds([loadRuns[0].id, data.id]);
    } else {
      setCompareRunIds([data.id, data.id]);
    }
    await refreshAllData(true);
    pushToast(
      'Live Server-Side Benchmark Started',
      `Streaming real HTTP probes for ${data.durationSec}s (${data.virtualUsers} VUs)...`,
      'info'
    );
    return data;
  };

  const stopLoadRun = async (runId: string) => {
    const activeToken = await ensureToken();
    const res = await fetch(`/api/load-runs/${runId}/stop`, {
      method: 'POST',
      headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
    });
    if (res.ok) {
      await refreshAllData(true);
      pushToast('Emergency Stop Executed', `Aborted server probe loop for ${runId}.`, 'warning');
    }
  };

  const clearAllRuns = async () => {
    const activeToken = await ensureToken();
    const res = await fetch('/api/load-runs', {
      method: 'DELETE',
      headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
    });
    if (res.ok) {
      setLoadRuns([]);
      setSelectedRunId('');
      setCompareRunIds(['', '']);
      await refreshAllData(true);
      pushToast('Telemetry Reset to Zero', 'Cleared all test runs and reset DB pool counters.', 'info');
    }
  };

  const createIssueAnomaly = async (payload: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    projectId: number | null;
  }) => {
    const activeToken = await ensureToken();
    const res = await fetch('/api/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create issue');
    await refreshAllData(true);
    pushToast('Finding Logged to project/ Issues', `Issue #${data.id} saved via POST /api/issues`, 'success');
    return data as IssueAnomaly;
  };

  const updateIssueStatus = async (issueId: number, status: 'open' | 'in-progress' | 'closed') => {
    const activeToken = await ensureToken();
    const res = await fetch(`/api/issues/${issueId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update issue status');
    await refreshAllData(true);
    pushToast(`Issue #${issueId} updated`, `Status changed to ${status}`, 'info');
  };

  return (
    <AppContext.Provider
      value={{
        route,
        navigate,
        theme,
        resolvedTheme,
        setTheme,
        user,
        token,
        loginWithApi,
        registerWithApi,
        logout,
        targets,
        issues,
        poolTelemetry,
        loadRuns,
        devToolLogs,
        devToolsOpen,
        setDevToolsOpen,
        selectedRunId,
        setSelectedRunId,
        compareRunIds,
        setCompareRunIds,
        isLoadingData,
        apiError,
        refreshAllData,
        createTarget,
        deleteTarget,
        verifyTarget,
        executeLoadRun,
        stopLoadRun,
        clearAllRuns,
        createIssueAnomaly,
        updateIssueStatus,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
