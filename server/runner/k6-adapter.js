import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let cachedK6Availability = null;

export async function isK6Available(bin = 'k6') {
  if (cachedK6Availability !== null) return cachedK6Availability;

  try {
    const isAvail = await new Promise((resolve) => {
      const child = spawn(bin, ['version'], { stdio: 'ignore', shell: false });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    });
    cachedK6Availability = isAvail;
    return isAvail;
  } catch {
    cachedK6Availability = false;
    return false;
  }
}

export function generateK6Script({ url, method, concurrency, durationSec }) {
  return `
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: ${concurrency},
  duration: '${durationSec}s',
  discardResponseBodies: true,
  thresholds: {},
};

export default function () {
  const params = {
    headers: {
      'User-Agent': 'ServerTest-k6/1.0',
    },
    timeout: '5s',
  };
  const res = http.request('${method}', '${url}', null, params);
  check(res, {
    'status ok': (r) => r.status >= 200 && r.status < 400,
  });
}
`;
}

export async function executeK6Run({ id, url, method, concurrency, durationSec, bin = 'k6' }, onCancel) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servertest-k6-'));
  const scriptPath = path.join(tmpDir, 'test.js');
  const summaryPath = path.join(tmpDir, 'summary.json');

  const scriptContent = generateK6Script({ url, method, concurrency, durationSec });
  await fs.writeFile(scriptPath, scriptContent, 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      ['run', '--summary-export', summaryPath, scriptPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    let cancelled = false;
    if (onCancel) {
      onCancel(() => {
        cancelled = true;
        child.kill('SIGTERM');
      });
    }

    child.on('error', err => {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      reject(err);
    });

    child.on('exit', async (code) => {
      try {
        let summaryData = null;
        try {
          const raw = await fs.readFile(summaryPath, 'utf8');
          summaryData = JSON.parse(raw);
        } catch {}

        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

        if (cancelled) {
          return resolve({ status: 'cancelled' });
        }

        if (summaryData) {
          const metrics = summaryData.metrics || {};
          const duration = metrics.http_req_duration?.values || {};
          const reqs = metrics.http_reqs?.values || {};
          const failed = metrics.http_req_failed?.values || {};

          const totalRequests = reqs.count || 0;
          const rps = Number((reqs.rate || 0).toFixed(2));
          const p50 = Number((duration['p(50)'] || duration.med || 0).toFixed(2));
          const p95 = Number((duration['p(95)'] || 0).toFixed(2));
          const p99 = Number((duration['p(99)'] || 0).toFixed(2));
          const errorRate = Number(((failed.rate || 0) * 100).toFixed(2));
          const failedCount = Math.round((failed.rate || 0) * totalRequests);
          const successCount = totalRequests - failedCount;

          return resolve({
            status: 'completed',
            totalRequests,
            successCount,
            failedCount,
            rps,
            p50,
            p95,
            p99,
            errorRate,
            statusCodes: {},
            finishedAt: new Date().toISOString(),
          });
        }

        if (code !== 0) {
          return reject(new Error(`k6 exited with code ${code}: ${stderr.slice(0, 300)}`));
        }

        resolve({ status: 'completed' });
      } catch (e) {
        reject(e);
      }
    });
  });
}

