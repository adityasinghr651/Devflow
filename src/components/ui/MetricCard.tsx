import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  icon?: any;
  trend?: 'up' | 'down' | 'neutral';
  glow?: 'lime' | 'blue' | 'none';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  glow = 'none',
  className = '',
}) => {
  const glowClass = glow === 'lime' ? 'cyber-card-glow-lime' : glow === 'blue' ? 'cyber-card-glow-blue' : '';

  return (
    <div className={`cyber-metric-card ${glowClass} ${className}`.trim()}>
      <div className="cyber-metric-header">
        <span>{label}</span>
        {Icon && <Icon size={16} />}
      </div>
      <div className="cyber-metric-val">
        <span>{value}</span>
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="cyber-metric-sub">{sub}</div>}
    </div>
  );
};

