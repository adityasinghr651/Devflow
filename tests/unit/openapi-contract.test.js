import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../server/app.js';

test('OpenAPI declares every Express API route and method', () => {
  const spec = fs.readFileSync('docs/openapi.yaml', 'utf8');
  const declaredPaths = new Set([...spec.matchAll(/^  (\/[^:]+):\s*$/gm)].map(match => match[1]));
  const sourceFiles = ['server/routes/health.js', 'server/routes/auth.js', 'server/routes/targets.js', 'server/routes/runs.js', 'server/routes/campaigns.js', 'server/routes/admin.js'];
  const missing = [];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const router = path.basename(file).replace('.js', '');
    for (const match of source.matchAll(/\b(?:health|auth|targets|runs|campaigns|admin)Router\.(get|post|patch|delete)\(['"]([^'"]+)['"]/g)) {
      const apiPath = match[2].replace(/:([A-Za-z]+)/g, '{$1}');
      const method = match[1].toLowerCase();
      const escapedPath = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathBlock = spec.match(new RegExp(`^  ${escapedPath}:\\s*\\r?\\n([\\s\\S]*?)(?=^  /|^components:)`, 'm'))?.[1];
      if (!declaredPaths.has(apiPath) || !pathBlock || !new RegExp(`^    ${method}:`, 'm').test(pathBlock)) {
        missing.push(`${router} ${method.toUpperCase()} ${apiPath}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Undocumented API routes: ${missing.join(', ')}`);
  assert.match(spec, /url: http:\/\/localhost:4000\/api\/v1/);
});

test('versioned API alias works and legacy alias carries deprecation headers', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const current = await fetch(`${base}/api/v1/health`);
    const legacy = await fetch(`${base}/api/health`);
    assert.equal(current.status, 200);
    assert.equal(current.headers.get('deprecation'), null);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.headers.get('deprecation'), 'true');
    assert.equal(legacy.headers.get('sunset'), '2027-11-04');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
