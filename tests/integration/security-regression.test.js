import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server/app.js';
import { setStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager, getRunnerManager } from '../../server/runner/manager.js';
import { generateToken } from '../../server/security/auth.js';
import { validateTargetUrl, isPrivateIPv4, isPrivateIPv6 } from '../../server/security/ssrf.js';
import { verifyTargetOwnership } from '../../server/security/ownership.js';
import jwt from 'jsonwebtoken';
import { config } from '../../server/config.js';

test('Security Regression: Comprehensive validation of security controls and boundaries', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-regression-test-'));
  const storage = new JsonStorage(tmpDir);
  await storage.init();
  setStorage(storage);
  const runner = getRunnerManager(storage);

  const app = createApp();
  const apiServer = http.createServer(app);
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const apiPort = apiServer.address().port;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

  t.after(async () => {
    const deadline = Date.now() + 5000;
    while (runner.activeRuns.size > 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (runner.activeRuns.size > 0) {
      for (const id of runner.activeRuns.keys()) await runner.cancelRun(id).catch(() => {});
    }
    await storage.writeQueue;
    await new Promise(r => apiServer.close(r));
    await storage.writeQueue;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // Setup Test Users
  const userA = await storage.createUser({
    id: 'sec-user-a',
    name: 'Alice Sec',
    email: 'alice@example.com',
    passwordHash: 'hashA',
  });
  const tokenA = generateToken(userA);

  const userB = await storage.createUser({
    id: 'sec-user-b',
    name: 'Bob Sec',
    email: 'bob@example.com',
    passwordHash: 'hashB',
  });
  const tokenB = generateToken(userB);

  // =========================================================================
  // 1. SSRF Protections at Target Registration and Worker Pre-Flight
  // =========================================================================
  await t.test('1. SSRF: Target registration rejects cloud metadata and private IP ranges', async () => {
    const restrictedUrls = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://10.0.0.5:8080/admin',
      'http://172.16.1.100/status',
      'http://192.168.1.1/router',
      'http://100.64.0.1/cgnat',
      'http://[fe80::1]/ipv6-link-local',
      'http://[fc00::1]/ipv6-ula',
      'ftp://example.com/file',
      'http://admin:secret@example.com',
    ];

    for (const testUrl of restrictedUrls) {
      const res = await fetch(`${apiBaseUrl}/targets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'Restricted Target Probe',
          url: testUrl,
          environment: 'Development',
        }),
      });

      assert.equal(
        res.status,
        400,
        `Expected HTTP 400 for restricted URL ${testUrl}, got ${res.status}`
      );
      const data = await res.json();
      assert.ok(data.error, `Expected error message for ${testUrl}`);
    }
  });

  await t.test('1. SSRF: Worker pre-flight blocks execution on runtime invalid/private targets', async () => {
    // Simulate a target whose stored URL fails pre-flight validation at worker execution
    const maliciousRun = {
      id: 'preflight-fail-run',
      userId: userA.id,
      targetId: 't-fake',
      targetName: 'Fake Target',
      url: 'http://169.254.169.254/latest/meta-data/',
      method: 'GET',
      concurrency: 1,
      durationSec: 2,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 2000,
      status: 'queued',
      startedAt: new Date().toISOString(),
      totalRequests: 0,
      successCount: 0,
      failedCount: 0,
      rps: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      errorRate: 0,
      statusCodes: {},
    };

    await storage.createRun(maliciousRun);
    await runner.enqueueRun(maliciousRun);

    // Poll until run transitions to failed
    const deadline = Date.now() + 4000;
    let finalRun = null;
    while (Date.now() < deadline) {
      const r = await storage.getRunById('preflight-fail-run');
      if (r && ['failed', 'cancelled'].includes(r.status)) {
        finalRun = r;
        break;
      }
      await new Promise(res => setTimeout(res, 80));
    }

    assert.ok(finalRun, 'Run must complete');
    assert.equal(finalRun.status, 'failed');
    assert.match(finalRun.error, /Runtime security check failed|blocked|Private/i);
    assert.equal(finalRun.totalRequests, 0, 'No requests must be dispatched on failed pre-flight');
  });

  // =========================================================================
  // 2. Redirect Handling (Neutralizing Open Redirect SSRF Bypasses)
  // =========================================================================
  await t.test('2. Redirects: Worker redirect: "error" blocks redirect-based SSRF', async () => {
    // Local redirect server that responds with 302 pointing to a simulated private resource
    const redirectServer = http.createServer((req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    await new Promise(resolve => redirectServer.listen(0, '127.0.0.1', resolve));
    const redirPort = redirectServer.address().port;

    const redirectRun = {
      id: 'redirect-ssrf-run',
      userId: userA.id,
      targetId: 't-redir',
      targetName: 'Redirect Target',
      url: `http://127.0.0.1:${redirPort}/redirect-endpoint`,
      method: 'GET',
      concurrency: 1,
      durationSec: 1,
      profile: 'fixed',
      stages: [],
      headers: {},
      body: null,
      timeoutMs: 2000,
      status: 'queued',
      startedAt: new Date().toISOString(),
      totalRequests: 0,
      successCount: 0,
      failedCount: 0,
      rps: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      errorRate: 0,
      statusCodes: {},
    };

    await storage.createRun(redirectRun);
    await runner.enqueueRun(redirectRun);

    const deadline = Date.now() + 4000;
    let finalRun = null;
    while (Date.now() < deadline) {
      const r = await storage.getRunById('redirect-ssrf-run');
      if (r && ['completed', 'failed'].includes(r.status)) {
        finalRun = r;
        break;
      }
      await new Promise(res => setTimeout(res, 80));
    }

    assert.ok(finalRun);
    assert.equal(finalRun.status, 'completed');
    assert.equal(finalRun.successCount, 0, 'Redirected responses must not be recorded as successful');
    assert.ok(finalRun.failedCount > 0, 'Redirect errors must be recorded as failed');
    assert.equal(finalRun.errorRate, 100, 'Error rate must be 100% due to redirect rejection');

    redirectServer.close();
  });

  // =========================================================================
  // 3. Ownership Verification Enforcement for External Targets
  // =========================================================================
  await t.test('3. Ownership: Unverified external targets cannot be load tested', async () => {
    // Create an external target with verified: false
    const externalTarget = await storage.createTarget({
      id: 'target-external-unverified',
      userId: userA.id,
      name: 'Unverified External Target',
      url: 'https://example.com',
      environment: 'Production',
      verified: false,
    });

    const runRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        targetId: externalTarget.id,
        path: '/',
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
      }),
    });

    assert.equal(runRes.status, 403);
    const body = await runRes.json();
    assert.match(body.error, /domain ownership verification required/i);
  });

  // =========================================================================
  // 4. Authorization and Tenant Isolation for Run APIs and SSE
  // =========================================================================
  await t.test('4. Tenant Isolation: User B cannot access, stream, or cancel User A runs', async () => {
    // Create a target and run owned by User A
    const targetA = await storage.createTarget({
      id: 'target-user-a',
      userId: userA.id,
      name: 'User A Target',
      url: 'http://127.0.0.1:5050',
      environment: 'Development',
      verified: true,
    });

    const runA = await storage.createRun({
      id: 'run-owned-by-user-a',
      userId: userA.id,
      targetId: targetA.id,
      targetName: targetA.name,
      url: 'http://127.0.0.1:5050/health',
      method: 'GET',
      concurrency: 1,
      durationSec: 5,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    // 1. User B attempts GET /api/runs/:id
    const getResB = await fetch(`${apiBaseUrl}/runs/${runA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getResB.status, 404, 'User B must receive 404 when querying User A run');

    // 2. User B attempts GET /api/runs/:id/events (SSE)
    const sseResB = await fetch(`${apiBaseUrl}/runs/${runA.id}/events?token=${tokenB}`);
    assert.equal(sseResB.status, 404, 'User B must receive 404 when connecting to User A SSE stream');

    // 3. User B attempts POST /api/runs/:id/cancel
    const cancelResB = await fetch(`${apiBaseUrl}/runs/${runA.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(cancelResB.status, 404, 'User B must receive 404 when attempting to cancel User A run');

    // 4. Unauthenticated request to SSE
    const sseNoAuth = await fetch(`${apiBaseUrl}/runs/${runA.id}/events`);
    assert.equal(sseNoAuth.status, 401, 'Unauthenticated SSE request must return 401');

    // 5. Expired token request to SSE
    const expiredToken = jwt.sign(
      { id: userA.id, email: userA.email },
      config.jwtSecret,
      { expiresIn: '-10s' }
    );
    const sseExpired = await fetch(`${apiBaseUrl}/runs/${runA.id}/events?token=${expiredToken}`);
    assert.equal(sseExpired.status, 401, 'Expired token SSE request must return 401');
  });

  // =========================================================================
  // 5. Secret Redaction in Storage, Audit Logs, and Reports
  // =========================================================================
  await t.test('5. Secret Redaction: Sensitive request headers are masked in stored runs and audit logs', async () => {
    const targetA = await storage.getTargetById('target-user-a', userA.id);

    const secretRunRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '/health',
        method: 'POST',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        headers: {
          'Authorization': 'Bearer super-secret-jwt-token-xyz',
          'X-Api-Key': 'production-api-key-999',
          'Cookie': 'sessionId=secret-cookie-val',
          'X-Custom-Secret': 'confidential-vault-key',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query: 'status' }),
      }),
    });

    assert.equal(secretRunRes.status, 202);
    const createdRun = await secretRunRes.json();

    // Fetch the run record
    const fetchedRes = await fetch(`${apiBaseUrl}/runs/${createdRun.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const fetchedRun = await fetchedRes.json();

    // Verify redactions
    assert.equal(fetchedRun.headers['Authorization'], '[REDACTED]');
    assert.equal(fetchedRun.headers['X-Api-Key'], '[REDACTED]');
    assert.equal(fetchedRun.headers['Cookie'], '[REDACTED]');
    assert.equal(fetchedRun.headers['X-Custom-Secret'], '[REDACTED]');
    assert.equal(fetchedRun.headers['Accept'], 'application/json', 'Safe headers remain unmasked');

    // Verify raw secret strings are NOT present anywhere in JSON serialization
    const serialized = JSON.stringify(fetchedRun);
    assert.equal(serialized.includes('super-secret-jwt-token-xyz'), false);
    assert.equal(serialized.includes('production-api-key-999'), false);
    assert.equal(serialized.includes('secret-cookie-val'), false);
    assert.equal(serialized.includes('confidential-vault-key'), false);

    // Verify audit logs do not contain raw headers or body
    const auditEvents = storage.store.auditEvents || [];
    const runCreateEvent = auditEvents.find(e => e.resourceId === createdRun.id);
    assert.ok(runCreateEvent);
    const auditStr = JSON.stringify(runCreateEvent);
    assert.equal(auditStr.includes('super-secret-jwt-token-xyz'), false);
    assert.equal(auditStr.includes('production-api-key-999'), false);
  });

  // =========================================================================
  // 6. Header Injection (CRLF) and Request-Body Validation
  // =========================================================================
  await t.test('6. Injection & Validation: Header CRLF, invalid names, and oversized bodies are rejected', async () => {
    const targetA = await storage.getTargetById('target-user-a', userA.id);

    // 1. CRLF Injection in header value
    const crlfRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '/health',
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        headers: { 'X-Injected': 'Value\r\nInjected-Header: evil' },
      }),
    });
    assert.equal(crlfRes.status, 400);
    const crlfBody = await crlfRes.json();
    assert.match(crlfBody.error, /CRLF/);

    // 2. Invalid header name containing colon or non-alphanumeric characters
    const badHeaderRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '/health',
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        headers: { 'Bad:Header': 'val' },
      }),
    });
    assert.equal(badHeaderRes.status, 400);

    // 3. Request body with GET method rejected
    const getWithBodyRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '/health',
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        body: 'Payload not allowed for GET',
      }),
    });
    assert.equal(getWithBodyRes.status, 400);
    const getBodyErr = await getWithBodyRes.json();
    assert.match(getBodyErr.error, /Request body is only allowed for POST, PUT, and PATCH/);

    // 4. Request body exceeding 64KB rejected
    const oversizedPayload = 'X'.repeat(66000); // 66 KB > 64 KB
    const oversizeRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '/health',
        method: 'POST',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
        body: oversizedPayload,
      }),
    });
    assert.ok([400, 413].includes(oversizeRes.status), `Expected 400 or 413, got ${oversizeRes.status}`);
    const oversizeErr = await oversizeRes.json();
    assert.match(oversizeErr.error, /size limit|exceed 64KB/i);

    // 5. Origin Escape attempt via double-slash path
    const originEscapeRes = await fetch(`${apiBaseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        targetId: targetA.id,
        path: '//evil.com/test',
        method: 'GET',
        concurrency: 1,
        durationSec: 1,
        authorized: true,
      }),
    });
    assert.equal(originEscapeRes.status, 400);
    const escapeErr = await originEscapeRes.json();
    assert.match(escapeErr.error, /path must start with a single slash/);
  });
});
