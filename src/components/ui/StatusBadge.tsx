import React from 'react';

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const s = (status || 'unknown').toLowerCase();
  
  let label = 'Unknown';
  switch (s) {
    case 'completed': label = 'Completed'; break;
    case 'running': label = 'Running'; break;
    case 'queued': label = 'Queued'; break;
    case 'validating': label = 'Validating'; break;
    case 'cancelled': label = 'Cancelled'; break;
    case 'timed_out': label = 'Timed Out'; break;
    case 'failed': label = 'Failed'; break;
    case 'warning': label = 'Review'; break;
    default: label = status;
  }

  return (
    <span className={`status-pill ${s} ${className}`.trim()}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};

