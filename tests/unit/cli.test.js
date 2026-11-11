import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('CLI submits a run, waits for results, and emits a JSON summary', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-cli-'));
  const configPath = path.join(temp, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ targetId: 't1', concurrency: 2, durationSec: 1 }));
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/runs') {
      res.writeHead(202, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'r1', status: 'queued' })); return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/r1') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'r1', status: 'completed', totalRequests: 10, successCount: 10, failedCount: 0, rps: 10, p50: 2, p95: 4, p99: 5, errorRate: 0 })); return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/r1/regression') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ verdict: 'pass', baselineCount: 3, historySize: 5, minimumBaselineRuns: 3 })); return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = `http://127.0.0.1:${server.address().port}/api/v1`;
    const child = spawn(process.execPath, ['bin/devflow.js', 'run', '-c', configPath, '--api', api, '--token', 'test-token', '--json'], { cwd: process.cwd() });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, stderr);
    const result = JSON.parse(stdout);
    assert.equal(result.totalRequests, 10);
    assert.equal(result.regression.historySize, 5);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('CLI rejects incomplete configuration with exit code 2', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-cli-'));
  const configPath = path.join(temp, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ targetId: 't1' }));
  try {
    const child = spawn(process.execPath, ['bin/devflow.js', 'run', '--config', configPath, '--api', 'http://localhost/api/v1', '--token', 'secret'], { cwd: process.cwd() });
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 2);
    assert.match(stderr, /integer concurrency/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('CLI exits 1 when statistical comparison reports a regression', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-cli-'));
  const configPath = path.join(temp, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ targetId: 't1', concurrency: 2, durationSec: 1 }));
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/runs') {
      res.writeHead(202, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'r1', status: 'queued' })); return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/r1') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'r1', status: 'completed', totalRequests: 0, successCount: 0, failedCount: 0 })); return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/r1/regression') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ verdict: 'regression', baselineCount: 3, minimumBaselineRuns: 3, metrics: {} })); return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = `http://127.0.0.1:${server.address().port}/api/v1`;
    const child = spawn(process.execPath, ['bin/devflow.js', 'run', '-c', configPath, '--api', api, '--token', 'test-token', '--json'], { cwd: process.cwd() });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 1, stderr);
    assert.equal(JSON.parse(stdout).regression.verdict, 'regression');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
});
