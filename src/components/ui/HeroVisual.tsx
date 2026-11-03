import React from 'react';
import { Zap } from 'lucide-react';
import { PerformanceDashboardCard } from './PerformanceDashboardCard.tsx';

interface HeroVisualProps {
  onLaunchClick?: () => void;
}

export const HeroVisual: React.FC<HeroVisualProps> = ({ onLaunchClick }) => {
  return (
    <div
      className="cyber-grid-bg"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '480px',
        borderRadius: 'var(--radius-xl)',
        background: 'radial-gradient(ellipse at 50% 30%, #0d1e45 0%, #050a18 100%)',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(37, 99, 235, 0.15)',
        overflow: 'hidden',
        padding: '38px 34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '32px',
      }}
    >
      {/* Corner Electric Blue / Cyan Glow Stripes */}
      <div className="corner-accent-tl" aria-hidden="true" />
      <div className="corner-accent-br" aria-hidden="true" />

      {/* Background Concentric Radar Rings */}
      <div className="radar-rings" aria-hidden="true" />

      {/* Left Composition: Code Mark, Server Blades, Lightning Bolt & Wireframe Terrain */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          flex: '1 1 300px',
          maxWidth: '440px',
        }}
      >
        {/* Glowing Developer Code Mark </ > (Electric Blue & Soft Cyan) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="cyber-code-mark">
            <span className="left-bracket">&lt;</span>
            <span className="slash">/</span>
            <span className="right-bracket">&gt;</span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-cyan)',
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ServerTest Core Engine
          </span>
        </div>

        {/* Server Blade Stack with Glowing Blue/Cyan LEDs & Lightning Bolt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="server-blade-rack">
            <div className="server-blade">
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#cbd5e1', fontWeight: 600 }}>
                SRV-01
              </span>
              <div className="server-blade-leds">
                <span className="server-led blink" />
                <span className="server-led cyan blink" style={{ animationDelay: '0.4s' }} />
                <span className="server-led" />
              </div>
            </div>
            <div className="server-blade">
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#cbd5e1', fontWeight: 600 }}>
                SRV-02
              </span>
              <div className="server-blade-leds">
                <span className="server-led cyan blink" style={{ animationDelay: '0.8s' }} />
                <span className="server-led green" />
                <span className="server-led blink" style={{ animationDelay: '1.2s' }} />
              </div>
            </div>
            <div className="server-blade">
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#cbd5e1', fontWeight: 600 }}>
                SRV-03
              </span>
              <div className="server-blade-leds">
                <span className="server-led blink" style={{ animationDelay: '0.2s' }} />
                <span className="server-led cyan" />
                <span className="server-led blink" style={{ animationDelay: '0.6s' }} />
              </div>
            </div>
          </div>

          {/* Electric Blue Glossy Lightning Bolt */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.3) 0%, rgba(56, 189, 248, 0.2) 100%)',
              border: '1.5px solid var(--color-blue-light)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 0 20px var(--color-blue-glow), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              color: 'var(--color-cyan)',
            }}
          >
            <Zap size={22} fill="currentColor" />
          </div>
        </div>

        {/* Informational Specs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.3px' }}>
            High-Precision Virtual User Engine
          </span>
          <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>
            Sub-millisecond latency histograms with guaranteed O(1) memory bounds and direct Server-Sent Events push.
          </p>
        </div>

        {/* 3D Wireframe Terrain Mesh SVG (Electric Blue to Cyan Gradient) */}
        <div style={{ width: '100%', height: '80px', marginTop: '10px' }}>
          <svg viewBox="0 0 380 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="wireframeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            {/* Undulating terrain mesh lines */}
            <path d="M 0 50 Q 80 20 180 45 T 380 35" stroke="url(#wireframeGrad)" strokeWidth="1.6" />
            <path d="M 0 60 Q 80 30 180 55 T 380 45" stroke="url(#wireframeGrad)" strokeWidth="1.3" opacity="0.85" />
            <path d="M 0 70 Q 80 40 180 65 T 380 55" stroke="url(#wireframeGrad)" strokeWidth="1" opacity="0.7" />
            {/* Vertical mesh crossbars */}
            {[20, 60, 100, 140, 180, 220, 260, 300, 340].map((x) => (
              <line key={x} x1={x} y1="35" x2={x + 10} y2="78" stroke="#3b82f6" strokeWidth="0.8" opacity="0.4" />
            ))}
          </svg>
        </div>
      </div>

      {/* Right Composition: Floating Reference Load-Test Dashboard Card */}
      <div style={{ position: 'relative', zIndex: 3, flex: '1 1 380px', display: 'flex', justifyContent: 'center' }}>
        <PerformanceDashboardCard onLaunchClick={onLaunchClick} />
      </div>
    </div>
  );
};
