import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestTargetServer, TARGET_CONFIG } from '../../tools/test-target.js';

test('Test Target: Endpoints, bounds, and security verification', async (t) => {
  const server = createTestTargetServer();

  // Bind to localhost ephemeral port (0) for reliable concurrent test execution
  await new Promise(resolve => server.listen(0, TARGET_CONFIG.host, resolve));
  const port = server.address().port;
  const baseUrl = `http://${TARGET_CONFIG.host}:${port}`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  // 1. GET /health - Predictable 200 response
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers.get('content-type'), 'application/json; charset=utf-8');
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'ok');
  assert.equal(healthData.service, 'ServerTest-Controlled-Target');
  assert.ok(typeof healthData.uptimeSec === 'number');

  // 2. GET /slow - Default and configured bounded delay
  const startSlow = performance.now();
  const slowRes = await fetch(`${baseUrl}/slow?ms=60`);
  const slowElapsed = performance.now() - startSlow;
  assert.equal(slowRes.status, 200);
  assert.ok(slowElapsed >= 50, `Expected delay >= 50ms, elapsed: ${slowElapsed}ms`);
  const slowData = await slowRes.json();
  assert.equal(slowData.delayedMs, 60);

  // GET /slow with default delay (100ms)
  const defaultSlowRes = await fetch(`${baseUrl}/slow`);
  assert.equal(defaultSlowRes.status, 200);
  const defaultSlowData = await defaultSlowRes.json();
  assert.equal(defaultSlowData.delayedMs, 100);

  // GET /slow rejection on exceeding max delay limit (5000ms)
  const excessiveSlowRes = await fetch(`${baseUrl}/slow?ms=6000`);
  assert.equal(excessiveSlowRes.status, 400);
  const excessiveSlowData = await excessiveSlowRes.json();
  assert.match(excessiveSlowData.error, /between 0 and 5000/);

  // GET /slow rejection on negative delay
  const negSlowRes = await fetch(`${baseUrl}/slow?ms=-10`);
  assert.equal(negSlowRes.status, 400);

  // 3. GET /status/500 - Predictable 500 error response
  const status500Res = await fetch(`${baseUrl}/status/500`);
  assert.equal(status500Res.status, 500);
  const status500Data = await status500Res.json();
  assert.equal(status500Data.statusCode, 500);
  assert.equal(status500Data.message, 'Simulated server error response.');

  // Other status codes (e.g. 404, 503)
  const status404Res = await fetch(`${baseUrl}/status/404`);
  assert.equal(status404Res.status, 404);

  const statusInvalidRes = await fetch(`${baseUrl}/status/999`);
  assert.equal(statusInvalidRes.status, 400);

  // 4. POST /echo - Valid JSON and text payloads
  const payload = { test: true, message: 'DevFlow Echo', items: [1, 2, 3] };
  const echoRes = await fetch(`${baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(echoRes.status, 200);
  const echoData = await echoRes.json();
  assert.deepEqual(echoData.echoed, payload);
  assert.ok(echoData.bytes > 0);

  // POST /echo payload exceeding 64KB (65536 bytes) is rejected
  const hugeBody = 'A'.repeat(TARGET_CONFIG.maxEchoBytes + 100);
  const hugeRes = await fetch(`${baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: hugeBody,
  }).catch(() => null); // Connection may be destroyed by server limit

  // If server responded before destroying connection, verify 413
  if (hugeRes) {
    assert.equal(hugeRes.status, 413);
  }

  // 5. GET /large - Configurable but bounded response payload
  const largeRes = await fetch(`${baseUrl}/large?kb=16`);
  assert.equal(largeRes.status, 200);
  const largeData = await largeRes.json();
  assert.equal(largeData.sizeKb, 16);
  assert.equal(largeData.bytes, 16 * 1024);
  assert.equal(largeData.data.length, 16 * 1024);

  // Default large size (64KB)
  const defaultLargeRes = await fetch(`${baseUrl}/large`);
  assert.equal(defaultLargeRes.status, 200);
  const defaultLargeData = await defaultLargeRes.json();
  assert.equal(defaultLargeData.sizeKb, 64);
  assert.equal(defaultLargeData.bytes, 64 * 1024);

  // Rejection when exceeding max size (512KB)
  const excessiveLargeRes = await fetch(`${baseUrl}/large?kb=1024`);
  assert.equal(excessiveLargeRes.status, 400);
  const excessiveLargeData = await excessiveLargeRes.json();
  assert.match(excessiveLargeData.error, /between 1 and 512 KB/);

  // 6. GET /unknown - Unmapped endpoint returns 404 with helpful endpoint list
  const notFoundRes = await fetch(`${baseUrl}/non-existent`);
  assert.equal(notFoundRes.status, 404);
  const notFoundData = await notFoundRes.json();
  assert.ok(Array.isArray(notFoundData.availableEndpoints));
});

test('Test Target: Deterministic measurement endpoints and reset', async (t) => {
  const server = createTestTargetServer();
  await new Promise(resolve => server.listen(0, TARGET_CONFIG.host, resolve));
  assert.equal(server.address().address, '127.0.0.1');
  const baseUrl = `http://${TARGET_CONFIG.host}:${server.address().port}`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  const fixedStart = performance.now();
  const fixedResponse = await fetch(`${baseUrl}/fixed?delayMs=40`);
  const fixedElapsed = performance.now() - fixedStart;
  assert.equal(fixedResponse.status, 200);
  assert.ok(fixedElapsed >= 30, `expected at least 30ms delay, got ${fixedElapsed.toFixed(1)}ms`);
  assert.equal((await fixedResponse.json()).delayMs, 40);
  assert.equal((await fetch(`${baseUrl}/fixed?delayMs=5001`)).status, 400);

  const flakyStatuses = [];
  for (let i = 0; i < 4; i++) {
    flakyStatuses.push((await fetch(`${baseUrl}/flaky?everyN=2&status=503`)).status);
  }
  assert.deepEqual(flakyStatuses, [200, 503, 200, 503]);

  const graphqlResults = [];
  for (let i = 0; i < 3; i++) {
    const response = await fetch(`${baseUrl}/graphql-errors?everyN=2`);
    graphqlResults.push({ status: response.status, data: await response.json() });
  }
  assert.deepEqual(graphqlResults.map(x => x.status), [200, 200, 200]);
  assert.equal(graphqlResults[0].data.errors, undefined);
  assert.ok(Array.isArray(graphqlResults[1].data.errors));
  assert.equal(graphqlResults[2].data.errors, undefined);

  const big = await fetch(`${baseUrl}/big?bytes=1234`);
  const bigBody = await big.arrayBuffer();
  assert.equal(big.status, 200);
  assert.equal(bigBody.byteLength, 1234);
  assert.equal((await fetch(`${baseUrl}/big?bytes=999999999`)).status, 400);

  const reset = await fetch(`${baseUrl}/__reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).reset, true);
  assert.equal((await fetch(`${baseUrl}/flaky?everyN=2&status=503`)).status, 200);
  const graphqlAfterReset = await fetch(`${baseUrl}/graphql-errors?everyN=2`);
  assert.equal(graphqlAfterReset.status, 200);
  assert.equal((await graphqlAfterReset.json()).errors, undefined);

  const controller = new AbortController();
  const hanging = fetch(`${baseUrl}/hang`, { signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(hanging, error => error.name === 'AbortError');
});

