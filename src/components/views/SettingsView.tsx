import React from 'react';
import { CreditCard, LogIn, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { User, ThemeMode } from '../../types/index.ts';
import { Card, PanelTitle } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';

interface SettingsViewProps {
  user: User | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
  setShowAuth: (show: boolean) => void;
  onOpenBilling: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  theme,
  setTheme,
  handleLogout,
  setShowAuth,
  onOpenBilling,
}) => {
  const currentTier = user?.tier || 'free';
  const tierLabel = currentTier === 'paid' ? 'Pro' : currentTier[0].toUpperCase() + currentTier.slice(1);
  const tierDescription = currentTier === 'admin'
    ? 'Administrator access; user-level run quotas do not apply.'
    : currentTier === 'paid'
    ? '10,000 accepted runs by default, configurable by the platform operator; includes campaigns and own-run deletion.'
    : currentTier === 'demo'
    ? 'Temporary demo access: up to 10 runs during this session, with demo workload limits.'
    : '15 accepted runs over the account lifetime, with saved run history.';

  return (
    <Card className="full-panel settings-panel page-animate">
      <PanelTitle
        title="Application Preferences & Environment"
        detail="Manage your account and choose how DevFlow looks on this device."
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

      <div className="setting-row">
        <div>
          <b>Current access plan</b>
          <p>{user ? tierDescription : 'Sign in to view the access plan for your account.'}</p>
        </div>
        <span className="env-pill">{user ? tierLabel : 'Signed out'}</span>
      </div>

      {user && (
        <div className="setting-row">
          <div><b>Plans &amp; payment</b><p>View your plan and available payment methods.</p></div>
          <Button variant="secondary" onClick={onOpenBilling} icon={<CreditCard size={14} />}>Open Billing &amp; Plans</Button>
        </div>
      )}

      {/* Theme Selection: Light, Dark, System */}
      <div className="setting-row">
        <div>
          <b>Appearance & Theme Preference</b>
            <p>Choose light, dark, or follow your system preference.</p>
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

      <div className="setting-row">
        <div>
          <b>Workspace data</b>
          <p>Targets and test runs are loaded from the connected DevFlow API when you sign in.</p>
        </div>
        <span className="env-pill">API-backed</span>
      </div>
    </Card>
  );
};

