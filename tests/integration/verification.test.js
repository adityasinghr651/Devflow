import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { generateToken } from '../../server/security/auth.js';
import { verifyTargetOwnership, isLocalhostTarget } from '../../server/security/ownership.js';

test('Target Ownership: isLocalhostTarget detection', () => {
  assert.equal(isLocalhostTarget('http://localhost:3000'), true);
  assert.equal(isLocalhostTarget('http://127.0.0.1:8080'), true);
  assert.equal(isLocalhostTarget('http://test.localhost:4000'), true);
  assert.equal(isLocalhostTarget('https://api.example.com'), false);
  assert.equal(isLocalhostTarget('https://production-server.net/api'), false);
  assert.equal(isLocalhostTarget('invalid-url'), false);
});

test('Target Ownership: Direct verification logic and safety rules', async () => {
  // 1. Missing token is rejected
  const noToken = await verifyTargetOwnership({ url: 'https://api.example.com' });
  assert.equal(noToken.verified, false);
  assert.match(noToken.error, /Missing target verification token/);

  // 2. Localhost permitted in development
  const localTarget = {
    url: 'http://localhost:3000',
    verificationToken: 'st_tok_12345',
  };
  const localRes = await verifyTargetOwnership(localTarget, { allowLocalTargets: true });
  assert.equal(localRes.verified, true);
  assert.equal(localRes.method, 'local_development');
  assert.ok(localRes.verifiedAt);

  // 3. Localhost blocked when allowLocalTargets is false
  const localBlocked = await verifyTargetOwnership(localTarget, { allowLocalTargets: false });
  assert.equal(localBlocked.verified, false);
  assert.match(localBlocked.error, /Local targets are disabled by server configuration/);

  // 4. SSRF block: target pointing to AWS metadata IP
  const metadataTarget = {
    url: 'http://169.254.169.254',
    verificationToken: 'st_tok_cloud',
  };
  const metadataRes = await verifyTargetOwnership(metadataTarget, { allowLocalTargets: false });
  assert.equal(metadataRes.verified, false);
  assert.match(metadataRes.error, /Security verification blocked/);

  // 5. Non-existent domain fails verification cleanly
  const nonExistent = {
    url: 'https://non-existent-subdomain-123456789.org',
    verificationToken: 'st_tok_unknown',
  };
  const failRes = await verifyTargetOwnership(nonExistent, { allowLocalTargets: false });
  assert.equal(failRes.verified, false);
  assert.match(failRes.error, /Domain ownership verification failed|Security verification blocked/);
});

test('Target Ownership: API POST /api/targets/:id/verify workflow', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-verify-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  const user = await storage.createUser({
    id: 'user-v-1',
    name: 'Verifier User',
    email: 'verifier@example.com',
    passwordHash: 'hashV',
  });
  const token = generateToken(user);

  // Create an unverified external target
  const externalTarget = await storage.createTarget({
    id: 'target-ext-1',
    userId: user.id,
    name: 'Production Service',
    url: 'https://example.com',
    environment: 'Production',
    verified: false,
    verificationToken: 'st_tok_test_token_99',
    verificationMethod: null,
    verifiedAt: null,
    createdAt: new Date().toISOString(),
  });

  // Verify non-existent target returns 404
  const notFoundRes = await fetch(`${baseUrl}/targets/non-existent-id/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(notFoundRes.status, 404);

  // Verify external target when challenge is absent returns 400 with instructions
  const verifyFailRes = await fetch(`${baseUrl}/targets/${externalTarget.id}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(verifyFailRes.status, 400);
  const failData = await verifyFailRes.json();
  assert.equal(failData.verified, false);
  assert.match(failData.error, /Domain ownership verification failed for example\.com/);
  assert.equal(failData.verificationToken, 'st_tok_test_token_99');

  // Verify local target automatically succeeds
  const localTarget = await storage.createTarget({
    id: 'target-loc-1',
    userId: user.id,
    name: 'Local API',
    url: 'http://localhost:5000',
    environment: 'Development',
    verified: false,
    verificationToken: 'st_tok_local_99',
    verificationMethod: null,
    verifiedAt: null,
    createdAt: new Date().toISOString(),
  });

  const verifyLocalRes = await fetch(`${baseUrl}/targets/${localTarget.id}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(verifyLocalRes.status, 200);
  const localData = await verifyLocalRes.json();
  assert.equal(localData.verified, true);
  assert.equal(localData.target.verified, true);
  assert.equal(localData.target.verificationMethod, 'local_development');

  // Re-verifying already verified target returns already verified message
  const reVerifyRes = await fetch(`${baseUrl}/targets/${localTarget.id}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(reVerifyRes.status, 200);
  const reVerifyData = await reVerifyRes.json();
  assert.equal(reVerifyData.verified, true);
  assert.equal(reVerifyData.message, 'Target is already verified.');
});
