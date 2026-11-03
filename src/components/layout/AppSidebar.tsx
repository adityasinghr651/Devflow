import React from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Code2,
  History,
  Home,
  LayoutDashboard,
  Plus,
  Radio,
  Server,
  Settings,
  X,
} from 'lucide-react';
import { User } from '../../types/index.ts';
import { ServerTestLogo } from '../ui/ServerTestLogo.tsx';

interface AppSidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  user: User | null;
  activeRunsCount: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onNewTestClick: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentPage,
  onNavigate,
  user,
  activeRunsCount,
  mobileOpen,
  onMobileClose,
  onNewTestClick,
}) => {
  // Required Sidebar items:
  // - Overview
  // - API Targets
  // - Test Runs
  // - Live Metrics
  // - History
  // - Settings
  const navItems = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'API Targets', icon: Server },
    { name: 'Test Runs', icon: Activity, badge: activeRunsCount },
    { name: 'Live Metrics', icon: Radio },
    { name: 'History', icon: History },
    { name: 'Settings', icon: Settings },
  ];

  return (
    <>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand-row">
          <ServerTestLogo
            size="md"
            onClick={() => {
              onNavigate('Home');
              onMobileClose();
            }}
          />
          <button
            type="button"
            className="btn-icon mobile-close-btn"
            onClick={onMobileClose}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Workspace Switcher Pill (Linear / Vercel style) */}
        <div className="sidebar-workspace-pill">
          <div className="workspace-avatar">
            <span>{user ? user.name[0].toUpperCase() : 'S'}</span>
          </div>
          <div className="workspace-info">
            <span className="workspace-name">{user ? `${user.name}'s Workspace` : 'ServerTest Workspace'}</span>
            <span className="workspace-tier">{user ? user.email : 'Developer Preview'}</span>
          </div>
          <ChevronDown size={13} style={{ color: 'var(--text-dim)' }} />
        </div>

        {/* Quick Action: Run Test */}
        <div style={{ padding: '0 12px 14px' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', gap: '6px', fontSize: '13px', fontWeight: 600 }}
            onClick={() => {
              onMobileClose();
              onNewTestClick();
            }}
          >
            <Plus size={15} />
            <span>Run Test</span>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">PLATFORM</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPage === item.name ||
              (item.name === 'API Targets' && currentPage === 'Servers & Targets') ||
              (item.name === 'History' && (currentPage === 'Reports' || currentPage === 'Comparisons' || currentPage === 'Performance Analysis'));

            return (
              <button
                key={item.name}
                type="button"
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onMobileClose();
                  onNavigate(item.name);
                }}
              >
                <Icon size={16} />
                <span>{item.name}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="sidebar-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Bottom Resources & Footer */}
        <div className="sidebar-bottom-panel">
          <button
            type="button"
            className="sidebar-bottom-link"
            onClick={() => {
              onMobileClose();
              onNavigate('Home');
            }}
          >
            <Home size={15} />
            <span>Public Home</span>
          </button>

          <button
            type="button"
            className="sidebar-bottom-link"
            onClick={() => {
              onMobileClose();
              onNavigate('Documentation');
            }}
          >
            <BookOpen size={15} />
            <span>Documentation</span>
          </button>

          <a
            href="https://github.com/adityasinghr651/Devflow"
            target="_blank"
            rel="noreferrer"
            className="sidebar-bottom-link"
          >
            <Code2 size={15} />
            <span>GitHub Repository</span>
            <ArrowUpRight size={13} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </a>

          <div className="sidebar-status-box">
            <span className="status-dot-active" />
            <span>Target Engine: <b>Active</b></span>
            <span className="sidebar-status-tag">Live SSE</span>
          </div>
        </div>
      </aside>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
    </>
  );
};
