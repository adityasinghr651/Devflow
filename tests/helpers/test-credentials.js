import { randomBytes } from 'node:crypto';

// Ephemeral password for disposable integration-test accounts; never a deployable credential.
export function createTestPassword() {
  return `Df!${randomBytes(24).toString('base64url')}9A`;
}
