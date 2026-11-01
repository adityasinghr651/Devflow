import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Settings,
  ArrowRight,
  Menu,
  X,
  Code2,
  LayoutDashboard,
  Server,
  Activity,
  BookOpen,
  Zap,
} from 'lucide-react';
import { ServerTestLogo } from '../ui/ServerTestLogo.tsx';
import { ThemeMode, User } from '../../types/index.ts';

interface HomeNavbarProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  user: User | null;
  onSignInClick: () => void;
  onStartClick: () => void;
  onNavigate: (page: string) => void;
}

export const HomeNavbar: React.FC<HomeNavbarProps> = ({
  theme,
  onThemeChange,
  user,
  onSignInClick,
  onStartClick,
  onNavigate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="home-navbar">
      <div className="home-navbar-container">
        {/* Left: Brand Logo */}
        <ServerTestLogo
          size="md"
          onClick={() => {
            onNavigate('Home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        {/* Center: Desktop Nav Links */}
        <nav className="home-nav-links">
          <button
            type="button"
            className="home-nav-link"
            onClick={() => scrollToSection('features')}
          >
            Features
          </button>
          <button
            type="button"
            className="home-nav-link"
            onClick={() => scrollToSection('how-it-works')}
          >
            How it Works
          </button>
          <button
            type="button"
            className="home-nav-link"
            onClick={() => onNavigate('Documentation')}
          >
            Docs
          </button>
          <button
            type="button"
            className="home-nav-link"
            onClick={() => scrollToSection('pricing')}
          >
            Pricing
          </button>
          <a
            href="https://github.com/adityasinghr651/Devflow"
            target="_blank"
            rel="noreferrer"
            className="home-nav-link"
          >
            GitHub
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="home-nav-actions">
          {/* Theme Switcher */}
          <div className="theme-toggle-group nav-action-desktop" title="Select theme mode">
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => onThemeChange('light')}
              aria-label="Light theme"
              title="Light theme"
            >
              <Sun size={13} />
            </button>
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => onThemeChange('dark')}
              aria-label="Dark theme"
              title="Dark theme"
            >
              <Moon size={13} />
            </button>
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'system' ? 'active' : ''}`}
              onClick={() => onThemeChange('system')}
              aria-label="System preference"
              title="System preference"
            >
              <Settings size={13} />
            </button>
          </div>

          {user ? (
            <button
              type="button"
              className="btn-hero-primary btn-sm nav-action-desktop"
              onClick={onStartClick}
            >
              <span>Workspace</span>
              <ArrowRight size={13} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-pill-subtle nav-action-desktop"
                onClick={onSignInClick}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn-hero-primary btn-sm nav-action-desktop"
                onClick={onStartClick}
              >
                <span>Get Started</span>
                <ArrowRight size={13} />
              </button>
            </>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            className="btn-icon mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer page-animate">
          <nav className="mobile-drawer-links">
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('Overview');
              }}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </button>
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('API Targets');
              }}
            >
              <Server size={16} />
              <span>API Targets</span>
            </button>
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('Test Runs');
              }}
            >
              <Activity size={16} />
              <span>Test Runs</span>
            </button>
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => scrollToSection('features')}
            >
              <Zap size={16} />
              <span>Features</span>
            </button>
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => scrollToSection('how-it-works')}
            >
              <BookOpen size={16} />
              <span>How it Works</span>
            </button>
            <button
              type="button"
              className="mobile-drawer-item"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('Documentation');
              }}
            >
              <BookOpen size={16} />
              <span>Docs</span>
            </button>
            <a
              href="https://github.com/adityasinghr651/Devflow"
              target="_blank"
              rel="noreferrer"
              className="mobile-drawer-item"
            >
              <Code2 size={16} />
              <span>GitHub</span>
            </a>
          </nav>

          <div className="mobile-drawer-actions">
            <div className="theme-toggle-group" style={{ marginBottom: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                <Sun size={14} />
                <span style={{ fontSize: '11px', marginLeft: 4 }}>Light</span>
              </button>
              <button
                type="button"
                className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => onThemeChange('dark')}
              >
                <Moon size={14} />
                <span style={{ fontSize: '11px', marginLeft: 4 }}>Dark</span>
              </button>
              <button
                type="button"
                className={`theme-toggle-btn ${theme === 'system' ? 'active' : ''}`}
                onClick={() => onThemeChange('system')}
              >
                <Settings size={14} />
                <span style={{ fontSize: '11px', marginLeft: 4 }}>System</span>
              </button>
            </div>

            {user ? (
              <button
                type="button"
                className="btn-hero-primary full-button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onStartClick();
                }}
              >
                <span>Open Workspace</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-pill-subtle full-button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignInClick();
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn-hero-primary full-button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onStartClick();
                  }}
                >
                  <span>Get Started</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
