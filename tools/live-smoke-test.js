import http from 'node:http';
import { execSync } from 'node:child_process';

const API_BASE = 'http://127.0.0.1:4000/api';
const TARGET_BASE = 'http://127.0.0.1:5050';

function getRunningNodeProcesses() {
  try {
    const stdout = execSync('powershell "Get-Process -Name node | Measure-Object | Select-Object -ExpandProperty Count"', { encoding: 'utf8' });
    return Number(stdout.trim());
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSmokeSuite() {
  console.log('=== STARTING LIVE DISTRIBUTED RUNNER SMOKE TEST ===');
  console.log('Baseline Node processes running:', getRunningNodeProcesses());

  // 1. Authenticate user
  const email = 'smoke-runner-' + Date.now() + '@example.com';
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Test Engineer', email, password: 'SecurePassword123!' })
  });
  if (!regRes.ok) throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
  const { user, token } = await regRes.json();
  console.log(`Authenticated as user ${user.id}`);

  // 2. Register Target
  const targetRes = await fetch(`${API_BASE}/targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'Smoke Target 5050',
      url: TARGET_BASE,
      environment: 'Development'
    })
  });
  if (!targetRes.ok) throw new Error(`Target creation failed: ${targetRes.status} ${await targetRes.text()}`);
  const target = await targetRes.json();
  console.log(`Registered target ${target.id} (${target.url}), verified: ${target.verified}`);

  // Helper to execute a run and poll to completion
  async function executeRun(workerCount, concurrency, durationSec, options = {}) {
    console.log(`\n--- Starting Run with workerCount=${workerCount}, concurrency=${concurrency}, duration=${durationSec}s ---`);
    const baselineProcesses = getRunningNodeProcesses();

    const postRes = await fetch(`${API_BASE}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        targetId: target.id,
        path: '/health',
        method: 'GET',
        concurrency,
        durationSec,
        workerCount,
        authorized: true
      })
    });

    if (!postRes.ok) {
      const errBody = await postRes.text();
      return { status: postRes.status, error: errBody, ok: false };
    }

    const created = await postRes.json();
    const runId = created.id;
    console.log(`Run dispatched with ID: ${runId}`);

    // Wait 2s and inspect processes while running
    await sleep(2000);
    const activeProcesses = getRunningNodeProcesses();
    const observedWorkers = activeProcesses !== null && baselineProcesses !== null ? activeProcesses - baselineProcesses : null;
    console.log(`Active node processes during execution: ${activeProcesses} (delta from baseline: +${observedWorkers})`);

    if (options.cancelAfterMs) {
      console.log(`Waiting ${options.cancelAfterMs}ms before issuing cancellation...`);
      await sleep(options.cancelAfterMs);
      console.log(`Issuing POST /api/runs/${runId}/cancel...`);
      const cancelRes = await fetch(`${API_BASE}/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`Cancel response: ${cancelRes.status} ${await cancelRes.text()}`);
    }

    // Poll until terminal status
    const deadline = Date.now() + (durationSec * 1000) + 15000;
    let finalRun = null;
    while (Date.now() < deadline) {
      const pollRes = await fetch(`${API_BASE}/runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pollRes.ok) {
        const r = await pollRes.json();
        if (['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status)) {
          finalRun = r;
          break;
        }
      }
      await sleep(1000);
    }

    // Wait 1s for process cleanup
    await sleep(1000);
    const postRunProcesses = getRunningNodeProcesses();
    console.log(`Post-run node processes: ${postRunProcesses}`);

    return {
      ok: true,
      runId,
      workerCount,
      observedWorkerDelta: observedWorkers,
      requestedConcurrency: concurrency,
      finalRun,
      baselineProcesses,
      activeProcesses,
      postRunProcesses
    };
  }

  // --- Test C & D: Runs with 1, 2, and 4 workers (30 seconds each, 8 VUs) ---
  const results = [];
  for (const w of [1, 2, 4]) {
    const res = await executeRun(w, 8, 30);
    results.push(res);
  }

  // --- Test E: Cancellation Test ---
  console.log('\n=== TEST E: CANCELLATION TEST ===');
  // First attempt: 60-second request to verify DB schema behavior
  console.log('Attempting 60-second fixed duration run (to document DB constraint behavior)...');
  const attempt60 = await executeRun(4, 8, 60);
  console.log('60-second attempt result:', attempt60);

  // Second: 30-second run cancelled after 5 seconds
  console.log('\nExecuting 30-second run with workerCount=4 cancelled after 5 seconds...');
  const cancelTestResult = await executeRun(4, 8, 30, { cancelAfterMs: 5000 });

  // Verification that another run can start afterward
  console.log('\nVerifying DevFlow can start another run immediately after cancellation...');
  const followUpRun = await executeRun(1, 2, 3);

  console.log('\n=== COMPLETE SMOKE TEST RESULTS JSON ===');
  console.log(JSON.stringify({
    workloadRuns: results,
    attempt60,
    cancelTestResult,
    followUpRun
  }, null, 2));
}

runSmokeSuite().catch(err => {
  console.error('Fatal Smoke Suite Error:', err);
  process.exit(1);
});

