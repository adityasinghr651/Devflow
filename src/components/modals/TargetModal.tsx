import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { CircleHelp, LogIn } from 'lucide-react';

interface TargetModalProps {
  targetName: string;
  setTargetName: (val: string) => void;
  targetUrl: string;
  setTargetUrl: (val: string) => void;
  environment: string;
  setEnvironment: (val: string) => void;
  addTarget: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
  canSave: boolean;
  onSignIn: () => void;
  onClose: () => void;
}

export const TargetModal: React.FC<TargetModalProps> = ({
  targetName,
  setTargetName,
  targetUrl,
  setTargetUrl,
  environment,
  setEnvironment,
  addTarget,
  saving,
  error,
  canSave,
  onSignIn,
  onClose,
}) => {
  return (
    <Modal
      title="Register a Target Endpoint"
      subtitle="Add an API endpoint you own or have explicit authorization to assess."
      onClose={onClose}
    >
      <form onSubmit={addTarget} className="form-stack">
        {!canSave && <div className="target-auth-notice">
          <div><b>{error || 'Sign in to save this target'}</b><p>The demo workspace is read-only. Targets are saved to your account.</p></div>
          <Button type="button" variant="secondary" onClick={onSignIn} icon={<LogIn size={14} />}>Sign in</Button>
        </div>}
        {error && canSave && <div className="warning-box" role="alert"><CircleHelp size={16} /><span>{error}</span></div>}
        <label>
          Target name
          <input
            required
            maxLength={80}
            className="cyber-input"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder="Development API"
          />
        </label>
        <label>
          Base URL
          <input
            required
            type="url"
            className="cyber-input"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="http://localhost:3001"
          />
        </label>
        <label>
          Environment
          <select
            className="cyber-select"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option>Development</option>
            <option>Staging</option>
            <option>Production</option>
            <option>Local</option>
          </select>
        </label>
        <div className="form-hint">
          <ShieldCheck size={16} />
          <span>Non-local targets will require domain verification before running tests.</span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="btn-shine" disabled={saving || !canSave}>
            {saving ? 'Saving target…' : 'Save Target'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

