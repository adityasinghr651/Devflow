import React from 'react';
import { LogIn, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { User, ThemeMode } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';

interface SettingsViewProps {
  user: User | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
  setShowAuth: (show: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  theme,
  setTheme,
  handleLogout,
  setShowAuth,
}) => {
  return (
    <Card className="full-panel settings-panel page-animate">
      <PanelTitle
        title="Application Preferences & Environment"
        detail="Manage user authentication session, visual theme modes, and backend engine status."
      />

      {/* User Account */}
      <div className="setting-row">
        <div>
          <b>User Account & Authentication</b>
          <p>{user ? `Signed in as ${user.name} (${user.email})` : 'Not currently signed in'}</p>
        </div>
        {user ? (
          <Button variant="secondary" onClick={handleLogout} icon={<LogOut size={14} />}>
            Sign Out
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setShowAuth(true)} icon={<LogIn size={14} />}>
            Sign In
          </Button>
        )}
      </div>

      {/* Theme Selection: Light, Dark, System */}
      <div className="setting-row">
        <div>
          <b>Appearance & Theme Preference</b>
          <p>
            Choose between dark developer neon aesthetic, high-contrast light mode, or automatic system OS sync.
          </p>
        </div>
        <div className="theme-switch larger">
          <button
            type="button"
            className={theme === 'light' ? 'chosen' : ''}
            onClick={() => setTheme('light')}
          >
            <Sun size={15} /> Light
          </button>
          <button
            type="button"
            className={theme === 'dark' ? 'chosen' : ''}
            onClick={() => setTheme('dark')}
          >
            <Moon size={15} /> Dark
          </button>
          <button
            type="button"
            className={theme === 'system' ? 'chosen' : ''}
            onClick={() => setTheme('system')}
          >
            <Settings size={15} /> System
          </button>
        </div>
      </div>

      {/* Engine Status */}
      <div className="setting-row">
        <div>
          <b>Telemetry & Metrics Engine</b>
          <p>Out-of-process worker execution with O(1) bounded-memory latency histograms and real-time SSE push.</p>
        </div>
        <span className="status-pill completed">
          <i /> Phase 6.1 Active
        </span>
      </div>

      {/* Data Storage */}
      <div className="setting-row">
        <div>
          <b>Data Persistence Layer</b>
          <p>PostgreSQL schema with strict tenant isolation and atomic transaction migrations.</p>
        </div>
        <span className="env-pill">PostgreSQL Engine</span>
      </div>
    </Card>
  );
};

