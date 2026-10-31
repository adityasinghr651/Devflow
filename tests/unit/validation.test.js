import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetPayload, validateRunPayload } from '../../server/security/validation.js';

test('Validation: Target payload validation', async () => {
  const missingName = await validateTargetPayload({ name: '', url: 'http://localhost:3000' });
  assert.equal(missingName.valid, false);
  assert.match(missingName.error, /between 1 and 80 characters/);

  const missingUrl = await validateTargetPayload({ name: 'Valid Name', url: '' });
  assert.equal(missingUrl.valid, false);
  assert.match(missingUrl.error, /valid target URL is required/);

  const valid = await validateTargetPayload({
    name: 'Local API',
    url: 'http://localhost:3001',
    environment: 'Development',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.name, 'Local API');
  assert.equal(valid.data.url, 'http://localhost:3001');
  assert.equal(valid.data.environment, 'Development');
});

test('Validation: Run payload requires explicit authorization', () => {
  const target = { id: 't-1', name: 'Test Target', url: 'http://localhost:3001' };

  const unauth = validateRunPayload({ authorized: false }, target);
  assert.equal(unauth.valid, false);
  assert.equal(unauth.statusCode, 403);
  assert.match(unauth.error, /authorization confirmation is required/);
});

test('Validation: Run payload bounds enforcement', () => {
  const target = { id: 't-1', name: 'Test Target', url: 'http://localhost:3001' };

  // Concurrency too high
  const highC = validateRunPayload({ authorized: true, concurrency: 50 }, target);
  assert.equal(highC.valid, false);
  assert.equal(highC.statusCode, 400);
  assert.match(highC.error, /Concurrency must be an integer from 1 to 20/);

  // Duration too high
  const highD = validateRunPayload({ authorized: true, concurrency: 5, durationSec: 60 }, target);
  assert.equal(highD.valid, false);
  assert.equal(highD.statusCode, 400);
  assert.match(highD.error, /Duration must be an integer from 1 to 30/);

  // Invalid path
  const badPath = validateRunPayload({ authorized: true, path: 'no-slash' }, target);
  assert.equal(badPath.valid, false);
  assert.match(badPath.error, /path must start with a single slash/);

  // Valid run
  const valid = validateRunPayload(
    { authorized: true, path: '/health', method: 'GET', concurrency: 5, durationSec: 10 },
    target
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.data.url, 'http://localhost:3001/health');
  assert.equal(valid.data.method, 'GET');
});

