import React from 'react';
import { Target } from '../../types/index.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface TargetVerifyModalProps {
  target: Target;
  verifyLoading: boolean;
  verifyDomain: (targetId: string) => void;
  onClose: () => void;
}

export const TargetVerifyModal: React.FC<TargetVerifyModalProps> = ({
  target,
  verifyLoading,
  verifyDomain,
  onClose,
}) => {
  let hostname = '';
  try {
    hostname = new URL(target.url).hostname;
  } catch {
    hostname = target.url;
  }

  return (
    <Modal
      title="Verify Domain Ownership"
      subtitle={`Cryptographic proof of control required for ${target.url}`}
      onClose={onClose}
    >
      <div className="form-stack">
        <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          To prevent unauthorized traffic generation and potential denial-of-service vectors, non-local targets must prove domain ownership prior to test execution.
        </p>

        <div
          style={{
            background: 'var(--bg-subtle)',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-default)',
          }}
        >
          <b style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Verification Token:</b>
          <code
            style={{
              display: 'block',
              margin: '6px 0 0',
              padding: '8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              wordBreak: 'break-all',
              color: 'var(--color-cyan)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
          >
            {target.verificationToken || 'Generating token…'}
          </code>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>Option 1: DNS TXT Record</b>
          <p style={{ margin: '4px 0 6px' }}>
            Add a TXT record for hostname: <code>_servertest.{hostname}</code>
          </p>
          <code style={{ display: 'block', padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: '4px' }}>
            servertest-verify={target.verificationToken}
          </code>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>Option 2: HTTP .well-known Challenge</b>
          <p style={{ margin: '4px 0 6px' }}>Host a plain-text challenge file at:</p>
          <code style={{ display: 'block', padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: '4px' }}>
            {target.url}/.well-known/servertest-challenge.txt
          </code>
        </div>

        <div className="modal-actions" style={{ marginTop: '12px' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="btn-shine"
            loading={verifyLoading}
            onClick={() => verifyDomain(target.id)}
          >
            {verifyLoading ? 'Validating…' : 'Verify Ownership Now'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

