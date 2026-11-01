import React from 'react';

interface EmptyStateProps {
  icon: any;
  title: string;
  body: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  body,
  action,
}) => {
  return (
    <div className="empty-state" style={{ minHeight: '220px', padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '12px',
          border: '1px solid var(--border-default)',
          background: 'var(--bg-subtle)',
          color: 'var(--color-blue)',
          display: 'grid',
          placeItems: 'center',
          marginBottom: '16px',
        }}
      >
        <Icon size={24} />
      </div>
      <b style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</b>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '340px', lineHeight: '1.6', margin: '8px 0 16px' }}>{body}</p>
      {action && <div>{action}</div>}
    </div>
  );
};

