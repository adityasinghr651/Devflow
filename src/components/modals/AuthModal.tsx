import React from 'react';
import { CircleHelp, X, Lock, Mail, User as UserIcon, Zap, ArrowRight, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface AuthModalProps {
  authMode: 'login' | 'register';
  setAuthMode: (mode: 'login' | 'register') => void;
  authName: string;
  setAuthName: (val: string) => void;
  authEmail: string;
  setAuthEmail: (val: string) => void;
  authPassword: string;
  setAuthPassword: (val: string) => void;
  authSubmitting: boolean;
  authError: string;
  setAuthError: (val: string) => void;
  socialPrompt: 'github' | 'google' | null;
  setSocialPrompt: (val: 'github' | 'google' | null) => void;
  socialEmail: string;
  setSocialEmail: (val: string) => void;
  handleAuth: (e: React.FormEvent) => void;
  handleSocialAuth: (provider: 'github' | 'google', customEmail?: string) => void;
  handleDemoAuth?: () => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  authMode,
  setAuthMode,
  authName,
  setAuthName,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authSubmitting,
  authError,
  setAuthError,
  socialPrompt,
  setSocialPrompt,
  socialEmail,
  setSocialEmail,
  handleAuth,
  handleSocialAuth,
  handleDemoAuth,
  onClose,
}) => {
  return (
    <Modal
      title={authMode === 'login' ? 'Welcome Back to ServerTest' : 'Create Your Engineering Account'}
      subtitle="Sign in with your preferred provider, or jump right into the demo workspace."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="modal-animate">
        {authError && (
          <div className="warning-box" role="alert">
            <CircleHelp size={16} />
            <span>{authError}</span>
          </div>
        )}

        {/* 1-Click Instant Demo Access */}
        {handleDemoAuth && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60A5FA',
                  }}
                >
                  <Zap size={15} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Instant Developer Access
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Explore the full dashboard, live metrics, and test runner immediately.
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-hero-primary full-button"
              style={{ padding: '9px 14px', fontSize: '12px', marginTop: '4px' }}
              onClick={handleDemoAuth}
            >
              <Zap size={14} />
              <span>Launch Demo Workspace (1-Click)</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Social Auth Providers with 1-Click */}
        <div className="social-auth-group">
          <button
            type="button"
            className="social-btn github"
            disabled={authSubmitting}
            onClick={() => handleSocialAuth('github', 'developer@github.com')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span>Continue with GitHub</span>
          </button>

          <button
            type="button"
            className="social-btn google"
            disabled={authSubmitting}
            onClick={() => handleSocialAuth('google', 'developer@gmail.com')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.25C.45 8.15 0 9.94 0 12s.45 3.85 1.25 5.43l4.03-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.57l4.03 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="social-divider">or continue with email</div>

        {/* Mode Tabs */}
        <div className="auth-mode-tabs">
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('login');
              setAuthError('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('register');
              setAuthError('');
            }}
          >
            Create Account
          </button>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleAuth} className="form-stack">
          {authMode === 'register' && (
            <label>
              Full name
              <div style={{ position: 'relative' }}>
                <input
                  required
                  maxLength={80}
                  className="cyber-input"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Alex Mercer"
                />
              </div>
            </label>
          )}

          <label>
            Email address
            <div style={{ position: 'relative' }}>
              <input
                required
                type="email"
                className="cyber-input"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="engineer@company.com"
              />
            </div>
          </label>

          <label>
            Password
            <div style={{ position: 'relative' }}>
              <input
                required
                type="password"
                minLength={8}
                className="cyber-input"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
          </label>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <Button
              type="submit"
              variant="primary"
              disabled={authSubmitting}
              className="btn-shine full-button"
              style={{ padding: '11px', fontSize: '13px' }}
            >
              {authSubmitting
                ? 'Validating session…'
                : authMode === 'login'
                ? 'Sign In to Workspace'
                : 'Create Engineering Account'}
            </Button>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Cancel and browse as guest
          </button>
        </div>
      </div>
    </Modal>
  );
};
