import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { setStorage, getStorage } from '../../server/storage/index.js';
import { JsonStorage } from '../../server/storage/json-storage.js';
import { getRunnerManager } from '../../server/runner/manager.js';
import { generateToken } from '../../server/security/auth.js';

test('Campaign creation, listing, and stage reports are authenticated and owner scoped', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devflow-campaign-api-'));
  const storage = new JsonStorage(dataDir);
  await storage.init();
  setStorage(storage);
  const owner = await storage.createUser({ email: 'campaign-owner@example.test', passwordHash: 'hash', name: 'Owner', tier: 'paid', plan: 'pro' });
  const other = await storage.createUser({ email: 'campaign-other@example.test', passwordHash: 'hash', name: 'Other', tier: 'paid', plan: 'pro' });
  const target = await storage.createTarget({ userId: owner.id, name: 'Local target', url: 'http://127.0.0.1:5050', environment: 'Local', verified: false });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const ownerToken = generateToken(owner);
  const otherToken = generateToken(other);
  t.after(async () => {
    await getRunnerManager(storage).shutdown(1000);
    await new Promise(resolve => server.close(resolve));
    await storage.close();
    setStorage(null);
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  assert.equal((await fetch(`${base}/campaigns`)).status, 401);
  const create = await fetch(`${base}/campaigns`, {
    method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: target.id, path: '/health', method: 'GET', stageConcurrency: [1, 2, 3, 4], workerCount: 1, timeoutMs: 2000, headers: { Authorization: 'Bearer campaign-api-secret' }, authorized: true }),
  });
  assert.equal(create.status, 201);
  const campaign = await create.json();
  assert.equal(campaign.secretsEncrypted, undefined);
  assert.equal(campaign.headers.Authorization, '[REDACTED]');
  const ownerCampaign = await fetch(`${base}/campaigns/${campaign.id}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  assert.equal(ownerCampaign.status, 200);
  const persisted = await storage.getCampaignById(campaign.id, owner.id);
  assert.equal(JSON.stringify(persisted).includes('campaign-api-secret'), false);

  await storage.updateCampaign(campaign.id, { stages: campaign.stages.map((stage, index) => index ? stage : { ...stage, report: { campaign: { id: campaign.id, stage: 1 }, performance: { rps: 100 } } }) }, owner.id);
  const ownerReport = await fetch(`${base}/campaigns/${campaign.id}/stages/1/report`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  assert.equal(ownerReport.status, 200);
  assert.equal(ownerReport.headers.get('content-disposition')?.includes('stage-1.json'), true);
  const otherCampaign = await fetch(`${base}/campaigns/${campaign.id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(otherCampaign.status, 404);
  const otherReport = await fetch(`${base}/campaigns/${campaign.id}/stages/1/report`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(otherReport.status, 404);
  const otherList = await fetch(`${base}/campaigns`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.deepEqual(await otherList.json(), []);

  for (const action of ['start', 'advance', 'retry', 'cancel']) {
    const route = `${base}/campaigns/${campaign.id}/${action}`;
    assert.equal((await fetch(route, { method: 'POST' })).status, 401, `${action} requires authentication`);
    const otherAction = await fetch(route, { method: 'POST', headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(otherAction.status, 404, `a different owner must not access ${action}`);
  }

  const otherCreate = await fetch(`${base}/campaigns`, {
    method: 'POST', headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: target.id, path: '/health', method: 'GET', stageConcurrency: [1, 2, 3, 4], workerCount: 1, timeoutMs: 2000, authorized: true }),
  });
  assert.equal(otherCreate.status, 404, 'a user cannot create a campaign against another user target');
});
