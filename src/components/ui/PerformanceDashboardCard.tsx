import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface PerformanceDashboardCardProps {
  initialRps?: number;
  initialP95?: number;
  initialError?: string;
  onLaunchClick?: () => void;
  className?: string;
  interactive?: boolean;
}

export const PerformanceDashboardCard: React.FC<PerformanceDashboardCardProps> = ({
  initialRps = 2840,
  initialP95 = 312,
  initialError = '0.00%',
  onLaunchClick,
  className = '',
  interactive = true,
}) => {
  const [rps, setRps] = useState(initialRps);
  const [p95, setP95] = useState(initialP95);
  const [activeTab, setActiveTab] = useState<'latency' | 'throughput'>('latency');

  useEffect(() => {
    if (!interactive) return;
    const interval = setInterval(() => {
      setRps((prev) => Math.floor(2800 + Math.random() * 85));
      setP95((prev) => Math.floor(305 + Math.random() * 15));
    }, 2400);
    return () => clearInterval(interval);
  }, [interactive]);

  return (
    <div
      className={`reference-card-glass ${className}`.trim()}
      style={{ padding: '24px', maxWidth: '520px', width: '100%' }}
    >
      {/* Top Header Pill like in the Reference Image (Glossy Electric Blue) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          className="neon-pill-button btn-shine"
          onClick={onLaunchClick}
          title="Click to launch load test"
        >
          <Play size={13} fill="currentColor" />
          <span>Load Test</span>
        </button>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--bg-subtle)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-default)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('latency')}
            style={{
              background: activeTab === 'latency' ? 'var(--color-blue-bg)' : 'transparent',
              color: activeTab === 'latency' ? 'var(--color-blue-light)' : 'var(--text-muted)',
              border: activeTab === 'latency' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Live SSE
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('throughput')}
            style={{
              background: activeTab === 'throughput' ? 'var(--color-cyan-bg)' : 'transparent',
              color: activeTab === 'throughput' ? 'var(--color-cyan)' : 'var(--text-muted)',
              border: activeTab === 'throughput' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            k6 Engine
          </button>
        </div>
      </div>

      {/* Center Line Chart (Glossy Electric Blue to Luminous Cyan) */}
      <div style={{ position: 'relative', width: '100%', height: '140px', marginBottom: '22px' }}>
        <svg
          viewBox="0 0 460 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
        >
          <defs>
            {/* Glossy Blue to Luminous Cyan Gradient */}
            <linearGradient id="refLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="45%" stopColor="#3b82f6" />
              <stop offset="80%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#00d2ff" />
            </linearGradient>

            {/* Area Fill Gradient */}
            <linearGradient id="refAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.25" />
              <stop offset="50%" stopColor="var(--color-blue)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--color-blue)" stopOpacity="0" />
            </linearGradient>

            {/* Neon Glow Filter */}
            <filter id="neonLineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid Lines */}
          <line x1="20" y1="25" x2="440" y2="25" stroke="var(--border-subtle)" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="20" y1="65" x2="440" y2="65" stroke="var(--border-subtle)" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="20" y1="105" x2="440" y2="105" stroke="var(--border-subtle)" strokeDasharray="3 3" strokeWidth="1" />

          {/* Y Axis Reference Labels */}
          <text x="5" y="28" fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">0.9</text>
          <text x="5" y="68" fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">0.6</text>
          <text x="5" y="108" fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">0.3</text>

          {/* Area under curve */}
          <path
            d="M 25 110 Q 70 100 110 82 T 200 88 T 260 70 T 320 85 T 380 50 L 435 28 L 435 125 L 25 125 Z"
            fill="url(#refAreaGradient)"
          />

          {/* Glowing Dual-Color Electric Blue to Cyan Line */}
          <path
            d="M 25 110 Q 70 100 110 82 T 200 88 T 260 70 T 320 85 T 380 50 L 435 28"
            stroke="url(#refLineGradient)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#neonLineGlow)"
          />

          {/* Active Data Points */}
          <circle cx="110" cy="82" r="3" fill="#2563eb" />
          <circle cx="260" cy="70" r="3.5" fill="#3b82f6" />
          <circle cx="380" cy="50" r="4" fill="#38bdf8" />

          {/* Peak Pulsing Point with Halo */}
          <circle cx="435" cy="28" r="7" fill="#00d2ff" opacity="0.35" className="server-led blink" />
          <circle cx="435" cy="28" r="4" fill="#00d2ff" />
        </svg>

        {/* X Axis Time Marks */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 25px',
            marginTop: '4px',
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}
        >
          <span>00:01</span>
          <span>00:05</span>
          <span>00:10</span>
          <span>00:15</span>
          <span>00:20</span>
          <span>00:25</span>
        </div>
      </div>

      {/* Bottom Three Metrics Capsules with Glossy Reflections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.6px',
            }}
          >
            RPS
          </span>
          <b
            style={{
              display: 'block',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              marginTop: '4px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {new Intl.NumberFormat('en-US').format(rps)}
          </b>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.6px',
            }}
          >
            p95
          </span>
          <b
            style={{
              display: 'block',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              marginTop: '4px',
              color: 'var(--color-cyan)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {p95} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>ms</span>
          </b>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.6px',
            }}
          >
            Error
          </span>
          <b
            style={{
              display: 'block',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              marginTop: '4px',
              color: 'var(--color-green)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {initialError}
          </b>
        </div>
      </div>
    </div>
  );
};
