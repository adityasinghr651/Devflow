import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createTestTargetServer } from '../../tools/test-target.js';
import { createTestPassword } from '../helpers/test-credentials.js';

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startApi(port, dataDir) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, API_HOST: '127.0.0.1', API_PORT: String(port), DATA_DIR: dataDir, DATABASE_URL: '', ALLOW_LOCAL_TARGETS: 'true', JWT_SECRET: 'restart-test-secret-at-least-32-characters' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited during startup with code ${child.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/ready`)).ok) return child; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error('API startup timed out');
}

test('Reliability: SIGKILL during a run is reconciled as failed after restart', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-restart-'));
  const apiPort = await freePort();
  const target = createTestTargetServer();
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${apiPort}/api`;
  let api;
  t.after(async () => {
    if (api && api.exitCode === null) { api.kill('SIGTERM'); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
    await new Promise(resolve => target.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  api = await startApi(apiPort, dataDir);
  const password = createTestPassword();
  const registration = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'restart@example.test', name: 'Restart Test', password }),
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const targetResponse = await fetch(`${base}/targets`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'loopback', url: `http://127.0.0.1:${target.address().port}`, environment: 'Development' }),
  });
  assert.equal(targetResponse.status, 201);
  const localTarget = await targetResponse.json();
  const runResponse = await fetch(`${base}/runs`, {
    method: 'POST', headers,
    body: JSON.stringify({ targetId: localTarget.id, path: '/hang', concurrency: 1, durationSec: 20, timeoutMs: 10000, authorized: true }),
  });
  assert.equal(runResponse.status, 202, JSON.stringify(await runResponse.clone().json()));
  const run = await runResponse.json();
  const deadline = Date.now() + 5000;
  let active = false;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/runs/${run.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok && ['running', 'validating'].includes((await response.json()).status)) { active = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(active, true, 'run entered execution before forced server termination');
  const exited = once(api, 'exit');
  api.kill('SIGKILL');
  await exited;

  api = await startApi(apiPort, dataDir);
  const listResponse = await fetch(`${base}/runs`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(listResponse.status, 200);
  const runs = await listResponse.json();
  const recovered = runs.find(item => item.id === run.id);
  assert.equal(recovered.status, 'failed');
  assert.match(recovered.error, /server restart/i);
  assert.ok(recovered.finishedAt);
});

test('Reliability: SIGTERM drains an active run before server exit', async t => {
  if (process.platform === 'win32') {
    t.skip('Windows child termination does not deliver SIGTERM to a Node signal handler; covered by the direct RunnerManager shutdown test.');
    return;
  }
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-shutdown-process-'));
  const apiPort = await freePort();
  const target = createTestTargetServer();
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${apiPort}/api`;
  let api;
  t.after(async () => {
    if (api && api.exitCode === null) { api.kill('SIGTERM'); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
    await new Promise(resolve => target.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  api = await startApi(apiPort, dataDir);
  const password = createTestPassword();
  const registration = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'shutdown@example.test', name: 'Shutdown Test', password }),
  });
  const { token } = await registration.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const targetResponse = await fetch(`${base}/targets`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'loopback', url: `http://127.0.0.1:${target.address().port}`, environment: 'Development' }),
  });
  const localTarget = await targetResponse.json();
  const runResponse = await fetch(`${base}/runs`, {
    method: 'POST', headers,
    body: JSON.stringify({ targetId: localTarget.id, path: '/hang', concurrency: 1, durationSec: 20, timeoutMs: 10000, authorized: true }),
  });
  assert.equal(runResponse.status, 202);
  const run = await runResponse.json();
  const deadline = Date.now() + 5000;
  let active = false;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/runs/${run.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok && ['running', 'validating'].includes((await response.json()).status)) { active = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(active, true);
  const exited = once(api, 'exit');
  api.kill('SIGTERM');
  const [exitCode] = await exited;
  assert.equal(exitCode, 0);
  api = null;

  api = await startApi(apiPort, dataDir);
  const listResponse = await fetch(`${base}/runs`, { headers: { Authorization: `Bearer ${token}` } });
  const recovered = (await listResponse.json()).find(item => item.id === run.id);
  assert.equal(recovered.status, 'cancelled');
  assert.ok(recovered.finishedAt);
});
