import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRunPayload, sanitizeHeadersForStorage } from '../../server/security/validation.js';

test('Stages & Config: Workload stages validation and calculation', () => {
  const localTarget = { id: 't-local', name: 'Local Target', url: 'http://localhost:3000' };

  // Valid 3-stage profile (Ramp-up, Steady-state, Ramp-down)
  const validStages = [
    { durationSec: 5, target: 10 },
    { durationSec: 10, target: 10 },
    { durationSec: 5, target: 0 },
  ];

  const result = validateRunPayload(
    {
      authorized: true,
      profile: 'stages',
      stages: validStages,
      path: '/api/test',
    },
    localTarget
  );

  assert.equal(result.valid, true);
  assert.equal(result.data.profile, 'stages');
  assert.equal(result.data.durationSec, 20); // 5 + 10 + 5
  assert.equal(result.data.concurrency, 10); // peak concurrency
  assert.equal(result.data.stages.length, 3);

  // Reject empty stages
  const emptyStages = validateRunPayload(
    { authorized: true, profile: 'stages', stages: [] },
    localTarget
  );
  assert.equal(emptyStages.valid, false);
  assert.equal(emptyStages.statusCode, 400);

  // Reject negative target VUs
  const negVUs = validateRunPayload(
    { authorized: true, profile: 'stages', stages: [{ durationSec: 5, target: -1 }] },
    localTarget
  );
  assert.equal(negVUs.valid, false);
  assert.match(negVUs.error, /must be an integer between 0 and/);

  // Reject target VUs exceeding maxConcurrency (20)
  const excessiveVUs = validateRunPayload(
    { authorized: true, profile: 'stages', stages: [{ durationSec: 5, target: 25 }] },
    localTarget
  );
  assert.equal(excessiveVUs.valid, false);
  assert.match(excessiveVUs.error, /must be an integer between 0 and 20/);

  // Reject zero duration stage
  const zeroDur = validateRunPayload(
    { authorized: true, profile: 'stages', stages: [{ durationSec: 0, target: 5 }] },
    localTarget
  );
  assert.equal(zeroDur.valid, false);
  assert.match(zeroDur.error, /duration must be an integer between 1 and/);

  // Reject stages exceeding maxTotalStageDuration (60s)
  const tooLong = validateRunPayload(
    {
      authorized: true,
      profile: 'stages',
      stages: [
        { durationSec: 25, target: 5 },
        { durationSec: 25, target: 5 },
        { durationSec: 20, target: 5 },
      ],
    },
    localTarget
  );
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error, /Total stages duration cannot exceed 60 seconds/);
});

test('Stages & Config: Request method and header security', () => {
  const localTarget = { id: 't-local', name: 'Local Target', url: 'http://localhost:3000' };

  // Allowed methods: GET, POST, PUT, DELETE, HEAD, PATCH
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
    const res = validateRunPayload({ authorized: true, method }, localTarget);
    assert.equal(res.valid, true, `Method ${method} should be allowed`);
    assert.equal(res.data.method, method);
  }

  // Disallowed methods
  for (const method of ['TRACE', 'CONNECT', 'OPTIONS', 'FOO']) {
    const res = validateRunPayload({ authorized: true, method }, localTarget);
    assert.equal(res.valid, false, `Method ${method} should be rejected`);
    assert.equal(res.statusCode, 400);
    assert.match(res.error, /Unsupported HTTP method/);
  }

  // Header CRLF injection prevention
  const crlfHeader = validateRunPayload(
    {
      authorized: true,
      headers: { 'X-Injected': 'val\r\nInjected-Header: evil' },
    },
    localTarget
  );
  assert.equal(crlfHeader.valid, false);
  assert.match(crlfHeader.error, /CRLF and values > 1024 chars are rejected/);

  // Invalid header key characters
  const badKey = validateRunPayload(
    {
      authorized: true,
      headers: { 'Bad Key Space': 'val' },
    },
    localTarget
  );
  assert.equal(badKey.valid, false);
  assert.match(badKey.error, /Invalid header name/);
});

test('Stages & Config: Request body validation and method constraints', () => {
  const localTarget = { id: 't-local', name: 'Local Target', url: 'http://localhost:3000' };

  // Body with GET method is disallowed
  const getWithBody = validateRunPayload(
    { authorized: true, method: 'GET', body: '{"hello":"world"}' },
    localTarget
  );
  assert.equal(getWithBody.valid, false);
  assert.match(getWithBody.error, /Request body is only allowed for POST, PUT, and PATCH/);

  // Body with POST is allowed
  const postWithBody = validateRunPayload(
    { authorized: true, method: 'POST', body: '{"event":"load_test"}' },
    localTarget
  );
  assert.equal(postWithBody.valid, true);
  assert.equal(postWithBody.data.body, '{"event":"load_test"}');

  // Body exceeding 64KB (65536 bytes) is rejected
  const hugeBody = 'A'.repeat(65537);
  const tooBig = validateRunPayload(
    { authorized: true, method: 'POST', body: hugeBody },
    localTarget
  );
  assert.equal(tooBig.valid, false);
  assert.match(tooBig.error, /must not exceed 64KB/);
});

test('Stages & Config: Sensitive header sanitization for storage', () => {
  const rawHeaders = {
    'Authorization': 'Bearer supersecretjwttoken123',
    'Cookie': 'session_id=abcdef123456; theme=dark',
    'X-Api-Key': 'ak_live_998877665544332211',
    'X-Custom-Secret': 'classified-vault-key',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const sanitized = sanitizeHeadersForStorage(rawHeaders);

  assert.equal(sanitized['Authorization'], '[REDACTED]');
  assert.equal(sanitized['Cookie'], '[REDACTED]');
  assert.equal(sanitized['X-Api-Key'], '[REDACTED]');
  assert.equal(sanitized['X-Custom-Secret'], '[REDACTED]');
  assert.equal(sanitized['Content-Type'], 'application/json');
  assert.equal(sanitized['Accept'], 'application/json');
});

test('Stages & Config: Domain verification enforcement for non-local targets', () => {
  const unverifiedExternal = {
    id: 't-ext-1',
    name: 'External Prod API',
    url: 'https://api.example.com',
    verified: false,
  };

  const rejected = validateRunPayload({ authorized: true }, unverifiedExternal);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.statusCode, 403);
  assert.match(rejected.error, /Target domain ownership verification required for non-local targets/);

  const verifiedExternal = {
    id: 't-ext-2',
    name: 'Verified External API',
    url: 'https://api.example.com',
    verified: true,
  };

  const allowed = validateRunPayload({ authorized: true }, verifiedExternal);
  assert.equal(allowed.valid, true);
});

