import React from 'react';
import { Plus, Server, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Target } from '../../types/index.ts';

interface TargetsViewProps {
  targets: Target[];
  onShowTargetModal: () => void;
  onVerifyTarget: (target: Target) => void;
  onDeleteTarget: (id: string) => void;
}

export const TargetsView: React.FC<TargetsViewProps> = ({
  targets,
  onShowTargetModal,
  onVerifyTarget,
  onDeleteTarget,
}) => {
  return (
    <div className="dev-card page-animate" style={{ padding: '24px' }}>
      <div className="panel-header-row" style={{ marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            API Targets
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Endpoints authorized for load testing. Remote targets require domain verification.
          </span>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onShowTargetModal}
        >
          <Plus size={14} />
          <span>Add API Target</span>
        </button>
      </div>

      {targets.length === 0 ? (
        <div className="empty-state-clean">
          <Server size={28} style={{ color: 'var(--text-dim)' }} />
          <h4>No API targets registered</h4>
          <p>Register an endpoint you own or have permission to test.</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onShowTargetModal}
          >
            <Plus size={14} />
            <span>Add API Target</span>
          </button>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Target Name</th>
                <th>Base URL</th>
                <th>Environment</th>
                <th>Verification Status</th>
                <th>Added</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Server size={14} style={{ color: 'var(--color-blue)' }} />
                      <b style={{ color: 'var(--text-primary)' }}>{t.name}</b>
                      {t.isDemo && <span className="env-pill">Demo data</span>}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t.url}</td>
                  <td>
                    <span className="status-pill">{t.environment}</span>
                  </td>
                  <td>
                    {t.verified ? (
                      <span className="status-pill completed">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="status-pill warning"
                        style={{ cursor: 'pointer', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-amber)', borderColor: 'rgba(245, 158, 11, 0.25)' }}
                        onClick={() => onVerifyTarget(t)}
                      >
                        <ShieldAlert size={12} /> Verify Domain
                      </button>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      {!t.verified && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onVerifyTarget(t)}
                        >
                          Verify
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-icon btn-sm"
                        onClick={() => onDeleteTarget(t.id)}
                        title="Delete target"
                      >
                        <Trash2 size={13} style={{ color: 'var(--color-red)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
