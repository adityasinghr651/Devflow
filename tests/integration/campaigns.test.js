import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { RunnerManager } from '../../server/runner/manager.js';
import { BenchmarkCampaignManager } from '../../server/runner/campaign-manager.js';

async function fixture(t, { statusCode = 200, delayMs = 0, stageTargets = [3, 5, 7, 9] } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-campaign-'));
  const storage = new JsonStorage(dataDir);
  await storage.init();
  const user = await storage.createUser({ email: `${Date.now()}@campaign.test`, passwordHash: 'hash', name: 'Campaign tester' });
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    setTimeout(() => { res.writeHead(statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: statusCode < 400 })); }, delayMs);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const target = await storage.createTarget({ userId: user.id, name: 'Controlled local target', url: baseUrl, environment: 'Local', verified: true });
  const runner = new RunnerManager(storage);
  const manager = new BenchmarkCampaignManager(storage, runner, { stageTargets });
  t.after(async () => {
    await runner.shutdown(3000);
    await new Promise(resolve => server.close(resolve));
    await storage.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  return { dataDir, storage, user, target, runner, manager, baseUrl, get requests() { return requests; } };
}

async function createCampaign(f, { path: endpoint = '/health', maxErrorRatePercent = 0, stageConcurrency = [1, 1, 1, 1], warmupSec = 0, rampUpSec = 0 } = {}) {
  return f.manager.create(f.user.id, {
    name: 'Controlled campaign', targetId: f.target.id, targetName: f.target.name,
    targetBaseUrl: f.target.url, path: endpoint, method: 'GET', concurrency: Math.max(...stageConcurrency),
    stageConcurrency, workerCount: 1, timeoutMs: 2000, warmupSec, rampUpSec,
    maxErrorRatePercent, headers: { Authorization: 'Bearer campaign-secret' }, body: null,
  }, { headers: { Authorization: 'Bearer campaign-secret' }, body: null });
}

async function waitForCampaign(f, id, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const campaign = await f.storage.getCampaignById(id, f.user.id);
    if (predicate(campaign)) return campaign;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Campaign ${id} did not reach the expected state.`);
}

async function waitForCoordinator(f, runId) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const coordinator = f.runner.activeRuns.get(runId)?.coordinator;
    if (coordinator?.workers[0]?.child?.pid) return coordinator;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Coordinator for ${runId} did not start.`);
}

test('Campaign stages use separate exact-quota runs, wait for manual approval, and persist comparison reports', async t => {
  const f = await fixture(t);
  const campaign = await createCampaign(f);
  assert.equal(campaign.secretsEncrypted, undefined, 'campaign API representation hides encrypted secrets');
  assert.equal(campaign.headers.Authorization, '[REDACTED]');
  const stored = await f.storage.getCampaignById(campaign.id, f.user.id);
  assert.equal(JSON.stringify(stored).includes('campaign-secret'), false);

  await f.manager.start(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
  let current = await waitForCampaign(f, campaign.id, item => item.status === 'awaiting_approval');
  const runIds = [];
  for (let index = 0; index < current.stages.length; index++) {
    const stage = current.stages[index];
    const run = await f.storage.getRunById(stage.currentRunId || stage.runIds.at(-1), f.user.id);
    runIds.push(run.id);
    assert.equal(run.totalRequests, stage.requestTarget);
    assert.equal(run.histogramSampleCount, stage.requestTarget);
    assert.equal(run.successCount + run.failedCount, run.totalRequests);
    assert.equal(stage.status, 'successful');
    assert.ok(stage.report.generatedAt);
    if (index === 0) assert.equal(stage.report.comparison.previousStage, null);
    else assert.equal(stage.report.comparison.previousStage, index);

    const reloadedStorage = new JsonStorage(f.dataDir);
    const reloaded = await reloadedStorage.getCampaignById(campaign.id, f.user.id);
    assert.ok(reloaded.stages[index].report, 'stage report survives reloading persisted JSON storage');

    if (index < current.stages.length - 1) {
      assert.equal(current.stages[index + 1].status, 'pending', 'next stage must wait for explicit approval');
      current = await f.manager.advance(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
      current = await waitForCampaign(f, campaign.id, item => item.status === (index + 1 === 3 ? 'completed' : 'awaiting_approval'));
    }
  }
  assert.equal(new Set(runIds).size, 4, 'every stage receives a new run ID');
  assert.equal(f.requests, 24, 'the controlled target received exactly the four planned stage totals');
});

test('A quality failing stage stops progression and can be retried as a new run', async t => {
  const f = await fixture(t, { statusCode: 503, stageTargets: [3, 5, 7, 9] });
  const campaign = await createCampaign(f, { path: '/health', maxErrorRatePercent: 0 });
  await f.manager.start(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
  let current = await waitForCampaign(f, campaign.id, item => item.status === 'completed_with_errors');
  assert.equal(current.stages[0].status, 'completed_with_errors');
  assert.equal(current.stages[1].status, 'pending');
  assert.equal(current.stages[0].report.validation.qualityPassed, false);
  await assert.rejects(() => f.manager.advance(campaign.id, f.user.id, { url: `${f.baseUrl}/health` }), /no successful stage/);
  await f.manager.retry(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
  current = await waitForCampaign(f, campaign.id, item => item.status === 'completed_with_errors' && item.stages[0].runIds.length === 2);
  assert.notEqual(current.stages[0].runIds[0], current.stages[0].runIds[1]);
  assert.ok(current.stages[0].report.campaign.actualRequests > 0);
});

test('Campaign cancellation preserves partial run results and prevents the next stage', async t => {
  const f = await fixture(t, { delayMs: 100, stageTargets: [10_000, 20_000, 30_000, 40_000] });
  const campaign = await createCampaign(f, { stageConcurrency: [1, 1, 1, 1] });
  await f.manager.start(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
  const running = await waitForCampaign(f, campaign.id, item => item.currentRunId && item.status === 'running');
  await new Promise(resolve => setTimeout(resolve, 75));
  await f.manager.cancel(campaign.id, f.user.id);
  const cancelled = await waitForCampaign(f, campaign.id, item => item.status === 'cancelled');
  assert.equal(cancelled.stages[0].status, 'cancelled');
  assert.equal(cancelled.stages[1].status, 'pending');
  const run = await f.storage.getRunById(running.currentRunId, f.user.id);
  assert.ok(run.totalRequests < run.requestTarget);
  assert.ok(run.finishedAt);
});

test('A worker crash fails the stage, saves partial metrics, and halts progression', async t => {
  const f = await fixture(t, { stageTargets: [100_000, 200_000, 300_000, 400_000] });
  const campaign = await createCampaign(f);
  await f.manager.start(campaign.id, f.user.id, { url: `${f.baseUrl}/health`, maxWallDurationSec: 5 });
  const running = await waitForCampaign(f, campaign.id, item => item.currentRunId && item.status === 'running');
  const coordinator = await waitForCoordinator(f, running.currentRunId);
  coordinator.workers[0].child.kill('SIGKILL');
  const failed = await waitForCampaign(f, campaign.id, item => item.status === 'failed');
  assert.equal(failed.stages[0].status, 'failed');
  assert.ok(failed.stages[0].report);
  assert.equal(failed.stages[1].status, 'pending');
  const partial = await f.storage.getRunById(running.currentRunId, f.user.id);
  assert.ok(partial.error);
  assert.ok(partial.partialWorkers?.length);
});

test('Restart recovery marks in-flight campaigns failed and retains their partial report', async t => {
  const f = await fixture(t);
  const campaign = await createCampaign(f);
  await f.storage.createRun({ id: 'interrupted-run', userId: f.user.id, targetId: f.target.id, targetName: f.target.name, url: `${f.baseUrl}/health`, method: 'GET', concurrency: 1, durationSec: 30, requestTarget: 3, workerCount: 1, status: 'failed', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), totalRequests: 2, successCount: 2, failedCount: 0, statusCodes: { 200: 2 }, histogramSampleCount: 2, histogramComplete: false, partialWorkers: [0], rps: 2, p50: 1, p95: 1, p99: 1, minLatency: 1, maxLatency: 1, meanLatency: 1, errorRate: 0 });
  const raw = await f.storage.getCampaignById(campaign.id, f.user.id);
  raw.status = 'running'; raw.currentStage = 0; raw.currentRunId = 'interrupted-run';
  raw.stages[0].status = 'running'; raw.stages[0].currentRunId = 'interrupted-run'; raw.stages[0].runIds.push('interrupted-run');
  await f.storage.updateCampaign(campaign.id, raw, f.user.id);
  assert.equal(await f.manager.recoverAfterRestart(), 1);
  const recovered = await f.manager.get(campaign.id, f.user.id);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.stages[0].status, 'failed');
  assert.ok(recovered.stages[0].report);
});
