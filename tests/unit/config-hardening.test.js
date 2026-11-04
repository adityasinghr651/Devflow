import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function loadProductionConfig(extraEnv = {}) {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'valid-production-secret-at-least-32-characters', ...extraEnv };
  if (!Object.hasOwn(extraEnv, 'ALLOW_LOCAL_TARGETS')) delete env.ALLOW_LOCAL_TARGETS;
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import { config } from './server/config.js'; process.stdout.write(JSON.stringify({ allowLocalTargets: config.allowLocalTargets, corsOrigins: config.corsOrigins }))"], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

test('Config: production rejects missing/default/short JWT secrets and wildcard CORS', () => {
  for (const env of [
    { JWT_SECRET: '' },
    { JWT_SECRET: 'short' },
    { JWT_SECRET: 'dev-insecure-secret-servertest-local-change-in-prod-32chars' },
    { CORS_ORIGINS: '*' },
  ]) {
    const result = loadProductionConfig(env);
    assert.notEqual(result.status, 0, `config should reject ${JSON.stringify(env)}`);
  }
});

test('Config: production disables local targets by default and parses explicit CORS origins', () => {
  const result = loadProductionConfig({ ALLOW_LOCAL_TARGETS: 'false', CORS_ORIGINS: 'https://app.example,https://admin.example' });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.deepEqual(JSON.parse(output), {
    allowLocalTargets: false,
    corsOrigins: ['https://app.example', 'https://admin.example'],
  });
});
