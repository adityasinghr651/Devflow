import React from 'react';

interface ServerTestLogoProps {
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

export const ServerTestLogo: React.FC<ServerTestLogoProps> = ({
  size = 'md',
  onClick,
  className = '',
}) => {
  const badgeSize = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const promptSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;

  return (
    <div
      className={`servertest-brand-logo ${className}`}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? '8px' : '10px',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <div
        className="brand-badge"
        style={{
          width: `${badgeSize}px`,
          height: `${badgeSize}px`,
          borderRadius: size === 'sm' ? '6px' : '8px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-lime)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: `${promptSize}px`,
          letterSpacing: '-0.5px',
          boxShadow: 'var(--shadow-sm)',
          flexShrink: 0,
        }}
        title="ServerTest"
      >
        <span>&gt;_</span>
      </div>

      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          letterSpacing: '-0.4px',
          lineHeight: 1,
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ color: 'var(--text-primary)' }}>Server</span>
        <span style={{ color: 'var(--color-lime)' }}>Test</span>
      </div>
    </div>
  );
};
