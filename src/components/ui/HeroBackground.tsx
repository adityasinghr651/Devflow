import React from 'react';

export const HeroBackground: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {/* 1. Subtle Developer Grid Overlay */}
      <div className="hero-grid-overlay" />

      {/* 2. Dark Mode Aurora Waves (Muted Electric Blue & Soft Cyan) */}
      <svg
        className="hero-aurora-waves-dark"
        viewBox="0 0 1440 680"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{
          width: '100%',
          height: '100%',
          opacity: 0.85,
        }}
      >
        <defs>
          <linearGradient id="darkBlueGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
            <stop offset="25%" stopColor="#3B82F6" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#60A5FA" stopOpacity="0.8" />
            <stop offset="75%" stopColor="#38BDF8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="darkWaveGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#080B12" stopOpacity="0.8" />
            <stop offset="30%" stopColor="#1E3A8A" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#0284C7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#080B12" stopOpacity="0.8" />
          </linearGradient>

          <filter id="darkGlowBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Dark Waves */}
        <path
          d="M-50 480 C 250 420, 450 560, 720 500 C 990 440, 1190 560, 1490 460 L 1490 680 L -50 680 Z"
          fill="url(#darkWaveGrad)"
          opacity="0.6"
        />

        {/* Crisp Luminous Wave 1 */}
        <path
          d="M-50 490 C 220 440, 480 570, 740 500 C 1000 430, 1220 540, 1490 470"
          stroke="url(#darkBlueGlow)"
          strokeWidth="2.5"
          filter="url(#darkGlowBlur)"
        />

        {/* Crisp Luminous Wave 2 (Lower harmonic) */}
        <path
          d="M-50 540 C 280 480, 520 600, 780 530 C 1040 460, 1260 580, 1490 510"
          stroke="url(#darkBlueGlow)"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </svg>

      {/* 3. Light Mode Multi-Color Pastel Aurora (Cyan, Violet, Rose, Warm Yellow) */}
      <svg
        className="hero-aurora-waves-light"
        viewBox="0 0 1440 680"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <linearGradient id="lightPastelWave" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.45" />    {/* Warm Yellow */}
            <stop offset="25%" stopColor="#F472B6" stopOpacity="0.4" />   {/* Rose Pink */}
            <stop offset="55%" stopColor="#A78BFA" stopOpacity="0.35" />  {/* Violet */}
            <stop offset="80%" stopColor="#38BDF8" stopOpacity="0.4" />   {/* Cyan */}
            <stop offset="100%" stopColor="#818CF8" stopOpacity="0.3" />  {/* Indigo */}
          </linearGradient>

          <filter id="lightWaveBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="35" />
          </filter>
        </defs>

        {/* Soft Flowing Multi-Color Pastel Cloud */}
        <path
          d="M-80 480 C 180 380, 420 580, 720 460 C 1020 340, 1220 540, 1520 420 L 1520 700 L -80 700 Z"
          fill="url(#lightPastelWave)"
          filter="url(#lightWaveBlur)"
          opacity="0.85"
        />

        {/* Defined Soft Pastel Wave Contour */}
        <path
          d="M-80 520 C 200 430, 460 620, 740 500 C 1020 380, 1240 570, 1520 460"
          stroke="url(#lightPastelWave)"
          strokeWidth="3"
          opacity="0.6"
        />
      </svg>
    </div>
  );
};
