import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface TargetModalProps {
  targetName: string;
  setTargetName: (val: string) => void;
  targetUrl: string;
  setTargetUrl: (val: string) => void;
  environment: string;
  setEnvironment: (val: string) => void;
  addTarget: (e: React.FormEvent) => void;
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
  onClose,
}) => {
  return (
    <Modal
      title="Register a Target Endpoint"
      subtitle="Add an API endpoint you own or have explicit authorization to assess."
      onClose={onClose}
    >
      <form onSubmit={addTarget} className="form-stack">
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
          <Button type="submit" variant="primary" className="btn-shine">
            Save Target
          </Button>
        </div>
      </form>
    </Modal>
  );
};

