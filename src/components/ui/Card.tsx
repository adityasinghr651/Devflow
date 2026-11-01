import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: 'lime' | 'blue' | 'none';
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  glow = 'none',
  className = '',
  children,
  ...props
}) => {
  const glowClass = glow === 'lime' ? 'cyber-card-glow-lime' : glow === 'blue' ? 'cyber-card-glow-blue' : '';
  return (
    <div className={`cyber-card ${glowClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
};

interface PanelTitleProps {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  icon?: any;
}

export const PanelTitle: React.FC<PanelTitleProps> = ({
  title,
  detail,
  action,
  icon: Icon,
}) => {
  return (
    <div className="panel-title" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {Icon && <Icon size={18} style={{ color: 'var(--color-blue)' }} />}
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
          {detail && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '3px 0 0' }}>{detail}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

