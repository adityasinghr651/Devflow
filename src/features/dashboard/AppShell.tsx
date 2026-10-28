import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileSpreadsheet,
  GitCompare,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  PlusCircle,
  Server,
  Settings,
  Terminal,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ThemeSegmentedControl } from '../../components/ui/Primitives';
import { RouteId } from '../../types';

const NAV_ITEMS: Array<{
  id: RouteId;
  label: string;
  icon: React.ReactNode;
  group: 'Core Testing' | 'Telemetry & Diagnostics' | 'System & Docs';
}> = [
  {
    id: 'app-overview',
    label: 'Overview',
    icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    group: 'Core Testing',
  },
  {
    id: 'app-targets',
    label: 'Servers & Targets',
    icon: <Server className="w-4 h-4 shrink-0" />,
    group: 'Core Testing',
  },
  {
    id: 'app-create-test',
    label: 'Create Test',
    icon: <PlusCircle className="w-4 h-4 shrink-0" />,
    group: 'Core Testing',
  },
  {
    id: 'app-runs',
    label: 'Test Runs',
    icon: <Layers className="w-4 h-4 shrink-0" />,
    group: 'Core Testing',
  },
  {
    id: 'app-live',
    label: 'Live Monitoring',
    icon: <Activity className="w-4 h-4 shrink-0" />,
    group: 'Telemetry & Diagnostics',
  },
  {
    id: 'app-analysis',
    label: 'Performance Analysis',
    icon: <Cpu className="w-4 h-4 shrink-0" />,
    group: 'Telemetry & Diagnostics',
  },
  {
    id: 'app-reports',
    label: 'Reports',
    icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
    group: 'Telemetry & Diagnostics',
  },
  {
    id: 'app-comparisons',
    label: 'Comparisons',
    icon: <GitCompare className="w-4 h-4 shrink-0" />,
    group: 'Telemetry & Diagnostics',
  },
  {
    id: 'app-integrations',
    label: 'Integrations & API Map',
    icon: <BarChart3 className="w-4 h-4 shrink-0" />,
    group: 'System & Docs',
  },
  {
    id: 'docs',
    label: 'Documentation',
    icon: <BookOpen className="w-4 h-4 shrink-0" />,
    group: 'System & Docs',
  },
  {
    id: 'app-settings',
    label: 'Settings',
    icon: <Settings className="w-4 h-4 shrink-0" />,
    group: 'System & Docs',
  },
];

export const AuthenticatedAppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route, navigate, user, logout, devToolsOpen, setDevToolsOpen } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((n) => n.id === route) || NAV_ITEMS[0];

  const renderSidebarLinks = (isMobile = false) => {
    const groups = ['Core Testing', 'Telemetry & Diagnostics', 'System & Docs'] as const;
    return (
      <div className="space-y-6">
        {groups.map((grp) => (
          <div key={grp} className="space-y-1">
            {(!collapsed || isMobile) && (
              <div className="px-3 text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                {grp}
              </div>
            )}
            {NAV_ITEMS.filter((item) => item.group === grp).map((item) => {
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={collapsed && !isMobile ? item.label : undefined}
                  onClick={() => {
                    navigate(item.id);
                    if (isMobile) setMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[var(--accent-cobalt-soft)] text-[var(--text-primary)] font-semibold border border-[var(--accent-cobalt)]/40'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={active ? 'text-[var(--accent-cobalt)]' : 'text-[var(--text-muted)]'}>
                    {item.icon}
                  </span>
                  {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] bg-dev-grid text-[var(--text-primary)]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md transition-all no-print shrink-0 ${
          collapsed ? 'w-[68px]' : 'w-[252px]'
        }`}
      >
        <div className="p-3.5 space-y-6">
          <div className="flex items-center justify-between px-1.5">
            {!collapsed && (
              <button
                type="button"
                onClick={() => navigate('home')}
                className="flex items-center gap-2 text-base font-extrabold tracking-tight font-display text-[var(--text-primary)] cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-lime)] shadow-[0_0_10px_rgba(190,242,100,0.65)]" />
                <span>PulseBench</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {renderSidebarLinks(false)}
        </div>

        <div className="p-3.5 border-t border-[var(--border-subtle)] space-y-2">
          {!collapsed && (
            <div className="px-2 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs">
              <div className="font-semibold text-[var(--text-primary)] truncate">
                {user?.name || 'Aditya Singh'}
              </div>
              <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                {user?.email || 'aditya@lab-engineering.dev'}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg border border-[var(--border-subtle)] cursor-pointer"
          >
            {collapsed ? 'Home' : 'Public Website & Demo'}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-[var(--bg-surface)] border-r border-[var(--border-strong)] p-4 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-base font-extrabold font-display">PulseBench</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="text-[var(--text-muted)]"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderSidebarLinks(true)}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Authenticated Top Header */}
        <header className="sticky top-0 z-30 bg-[var(--bg-surface)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-6 py-3 flex items-center justify-between gap-4 no-print">
          {/* Left: Mobile Trigger + Contextual Breadcrumb Trail */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)]"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono truncate">
              <button
                type="button"
                onClick={() => navigate('home')}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                PulseBench
              </button>
              <span className="text-[var(--border-strong)]">/</span>
              <span className="text-[var(--text-muted)] hidden sm:inline">
                {currentNav.group}
              </span>
              <span className="text-[var(--border-strong)] hidden sm:inline">/</span>
              <span className="text-[var(--text-primary)] font-semibold truncate">
                {currentNav.label}
              </span>
            </nav>
          </div>

          {/* Right: DevTools Trigger + Theme Selector + Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setDevToolsOpen(!devToolsOpen)}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                devToolsOpen
                  ? 'border-[var(--accent-lime)] text-[var(--accent-lime)] bg-[var(--accent-lime-soft)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Toggle Background Developer Tools Console"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>DevTools</span>
            </button>

            <ThemeSegmentedControl compact />

            <button
              type="button"
              onClick={() => navigate('app-create-test')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg btn-cobalt-shiny transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Load Test</span>
            </button>

            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto pb-20">{children}</main>
      </div>
    </div>
  );
};
