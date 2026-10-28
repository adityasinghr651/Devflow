import React from 'react';
import { X } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import {
  AuthPages,
  CommunityPage,
  DocsPage,
  HomePage,
  LegalAndStatusPages,
  ProductPage,
} from './features/public/PublicPages';
import { AuthenticatedAppShell } from './features/dashboard/AppShell';
import {
  CreateTestWizardScreen,
  LiveMonitoringScreen,
  OverviewDashboardScreen,
  TargetsScreen,
} from './features/dashboard/DashboardScreens';
import {
  ComparisonsScreen,
  IntegrationsAndAuditScreen,
  PerformanceAnalysisScreen,
  ReportsScreen,
  SettingsScreen,
  TestRunsScreen,
} from './features/dashboard/AnalysisAndAdminScreens';

import { DeveloperToolsConsole } from './components/ui/Primitives';

const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none no-print"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3.5 shadow-lg flex items-start justify-between gap-3"
        >
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[var(--text-primary)]">{t.title}</div>
            {t.detail && (
              <div className="text-[11px] font-mono text-[var(--text-secondary)]">{t.detail}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

const RouterView: React.FC = () => {
  const { route } = useApp();

  // Public Routes
  if (route === 'home') return <HomePage />;
  if (route === 'product') return <ProductPage />;
  if (route === 'docs') return <DocsPage />;
  if (route === 'community') return <CommunityPage />;
  if (route.startsWith('auth-')) return <AuthPages mode={route} />;
  if (route.startsWith('legal-') || route.startsWith('status-')) {
    return <LegalAndStatusPages mode={route} />;
  }

  // Authenticated Application Routes
  return (
    <AuthenticatedAppShell>
      {route === 'app-overview' && <OverviewDashboardScreen />}
      {route === 'app-targets' && <TargetsScreen />}
      {route === 'app-create-test' && <CreateTestWizardScreen />}
      {route === 'app-runs' && <TestRunsScreen />}
      {route === 'app-live' && <LiveMonitoringScreen />}
      {route === 'app-analysis' && <PerformanceAnalysisScreen />}
      {route === 'app-reports' && <ReportsScreen />}
      {route === 'app-comparisons' && <ComparisonsScreen />}
      {route === 'app-integrations' && <IntegrationsAndAuditScreen />}
      {route === 'app-settings' && <SettingsScreen />}
    </AuthenticatedAppShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <RouterView />
      <DeveloperToolsConsole />
      <ToastStack />
    </AppProvider>
  );
}
