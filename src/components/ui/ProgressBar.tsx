import React from 'react';

interface ProgressBarProps {
  percent: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  label,
  sublabel,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, percent || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} className={className}>
      {(label || sublabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          {label && <span>{label}</span>}
          {sublabel && <span style={{ fontFamily: 'var(--font-mono)' }}>{sublabel}</span>}
        </div>
      )}
      <div
        style={{
          height: '8px',
          background: 'var(--bg-input)',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${clamped}%`,
            background: 'linear-gradient(90deg, var(--color-blue) 0%, var(--color-cyan) 50%, var(--color-lime) 100%)',
            borderRadius: '4px',
            boxShadow: '0 0 10px var(--color-lime-glow)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
};

