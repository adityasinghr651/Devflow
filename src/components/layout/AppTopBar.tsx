import React from 'react';
import { Menu, Sun, Moon, Settings, LogIn, Plus } from 'lucide-react';
import { User, ThemeMode } from '../../types/index.ts';

interface AppTopBarProps {
  currentPage: string;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  user: User | null;
  onSignInClick: () => void;
  onLogoutClick: () => void;
  onNavigate: (page: string) => void;
  onMobileToggle: () => void;
  onNewTestClick: () => void;
}

export const AppTopBar: React.FC<AppTopBarProps> = ({
  currentPage,
  theme,
  onThemeChange,
  user,
  onSignInClick,
  onLogoutClick,
  onNavigate,
  onMobileToggle,
  onNewTestClick,
}) => {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          className="btn-icon mobile-menu-trigger"
          onClick={onMobileToggle}
          aria-label="Open sidebar"
        >
          <Menu size={17} />
        </button>

        <div className="breadcrumbs">
          <span
            style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={() => onNavigate('Home')}
          >
            ServerTest
          </span>
          <span className="crumb-slash">/</span>
          <b style={{ color: 'var(--text-primary)' }}>{currentPage}</b>
        </div>
      </div>

      <div className="top-actions">
        {/* API Engine Status Indicator */}
        <div className="api-indicator">
          <span className="status-dot-active" />
          <span>API</span>
          <span className="api-host">localhost:4000</span>
        </div>

        {/* Theme Switcher: Light / Dark / System */}
        <div className="theme-toggle-group" title="Select theme mode">
          <button
            type="button"
            className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => onThemeChange('light')}
            aria-label="Light mode"
            title="Light mode"
          >
            <Sun size={13} />
          </button>
          <button
            type="button"
            className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => onThemeChange('dark')}
            aria-label="Dark mode"
            title="Dark mode"
          >
            <Moon size={13} />
          </button>
          <button
            type="button"
            className={`theme-toggle-btn ${theme === 'system' ? 'active' : ''}`}
            onClick={() => onThemeChange('system')}
            aria-label="System mode"
            title="Follow system preference"
          >
            <Settings size={13} />
          </button>
        </div>

        {/* Quick Action: Run Test */}
        <button
          type="button"
          className="btn btn-primary btn-sm topbar-action-btn"
          onClick={onNewTestClick}
        >
          <Plus size={14} />
          <span>Run Test</span>
        </button>

        {/* User Account / Sign In */}
        {user ? (
          <button
            type="button"
            className="user-avatar-pill"
            title={`Signed in as ${user.name} (${user.email})\nClick to sign out`}
            onClick={onLogoutClick}
          >
            <span className="avatar-letter">
              {user.name[0]?.toUpperCase() || 'U'}
            </span>
            <span className="avatar-name">{user.name.split(' ')[0]}</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-pill-subtle btn-sm"
            onClick={onSignInClick}
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
