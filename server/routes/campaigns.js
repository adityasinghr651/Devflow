import express from 'express';
import { getStorage } from '../storage/index.js';
import { getRunnerManager } from '../runner/manager.js';
import { BenchmarkCampaignManager } from '../runner/campaign-manager.js';
import { validateRunPayload } from '../security/validation.js';
import { authenticateToken } from '../security/auth.js';
import { config } from '../config.js';

export const campaignsRouter = express.Router();
let campaignManager;
function getCampaignManager() {
  if (!campaignManager) campaignManager = new BenchmarkCampaignManager(getStorage(), getRunnerManager(getStorage()));
  return campaignManager;
}

function validateCampaignInput(body, target) {
  if (!Array.isArray(body.stageConcurrency)) return { valid: false, statusCode: 400, error: 'Provide concurrency for each of the four campaign stages.' };
  const stageConcurrency = body.stageConcurrency;
  const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
  const request = validateRunPayload({
    targetId: target?.id, path: body.path, method,
    concurrency: Math.max(...stageConcurrency.map(Number)),
    durationSec: Math.min(30, config.maxDurationSec), profile: 'fixed',
    headers: body.headers || {}, body: body.body, timeoutMs: body.timeoutMs ?? 5000,
    workerCount: body.workerCount ?? 1, authorized: body.authorized === true,
  }, target, { maxConcurrency: config.maxConcurrency, maxDurationSec: config.maxDurationSec });
  if (!request.valid) return request;
  const stages = stageConcurrency;
  if (!Array.isArray(stages) || stages.length !== 4 || stages.some(value => !Number.isInteger(value) || value < (body.workerCount ?? 1) || value > config.maxConcurrency)) {
    return { valid: false, statusCode: 400, error: `Provide four stage concurrency values from ${body.workerCount ?? 1} to ${config.maxConcurrency}.` };
  }
  const workerCount = Number(body.workerCount ?? 1);
  if (![1, 2, 4].includes(workerCount)) return { valid: false, statusCode: 400, error: 'Worker count must be 1, 2, or 4.' };
  const warmupSec = Number(body.warmupSec ?? 0);
  const rampUpSec = Number(body.rampUpSec ?? 0);
  const timeoutMs = Number(body.timeoutMs ?? 5000);
  const maxErrorRatePercent = Number(body.maxErrorRatePercent ?? 0);
  if (!Number.isInteger(warmupSec) || warmupSec < 0 || warmupSec > 300) return { valid: false, statusCode: 400, error: 'Warm-up must be an integer from 0 to 300 seconds.' };
  if (!Number.isInteger(rampUpSec) || rampUpSec < 0 || rampUpSec > 300) return { valid: false, statusCode: 400, error: 'Ramp-up must be an integer from 0 to 300 seconds.' };
  if (!Number.isFinite(maxErrorRatePercent) || maxErrorRatePercent < 0 || maxErrorRatePercent > 100) return { valid: false, statusCode: 400, error: 'Maximum error rate must be between 0 and 100 percent.' };
  if (warmupSec + rampUpSec > 600) return { valid: false, statusCode: 400, error: 'Combined warm-up and ramp-up cannot exceed 600 seconds.' };
  return { valid: true, data: { ...request.data, method, stageConcurrency: stages, workerCount, warmupSec, rampUpSec, timeoutMs, maxErrorRatePercent } };
}

async function validateSavedCampaign(campaign, userId) {
  const storage = getStorage();
  const target = await storage.getTargetById(campaign.targetId, userId);
  if (!target) return { valid: false, statusCode: 404, error: 'Campaign target not found.' };
  return validateCampaignInput({
    targetId: campaign.targetId, path: campaign.path, method: campaign.method,
    stageConcurrency: campaign.stageConcurrency, workerCount: campaign.workerCount,
    timeoutMs: campaign.timeoutMs, warmupSec: campaign.warmupSec,
    rampUpSec: campaign.rampUpSec, maxErrorRatePercent: campaign.maxErrorRatePercent,
    authorized: true, headers: {},
  }, target);
}

campaignsRouter.get('/campaigns', authenticateToken, async (req, res, next) => {
  try { res.json(await getCampaignManager().list(req.user.id)); } catch (error) { next(error); }
});

campaignsRouter.post('/campaigns', authenticateToken, async (req, res, next) => {
  try {
    const target = await getStorage().getTargetById(req.body?.targetId, req.user.id);
    const validation = validateCampaignInput(req.body || {}, target);
    if (!validation.valid) return res.status(validation.statusCode || 400).json({ error: validation.error });
    const { data } = validation;
    const campaign = await getCampaignManager().create(req.user.id, {
      ...data, path: req.body.path || '/', name: String(req.body.name || '1M Request Benchmark Campaign').trim().slice(0, 80) || '1M Request Benchmark Campaign',
      targetId: target.id, targetName: target.name, targetBaseUrl: target.url,
    }, { headers: data.headers, body: data.body });
    await getStorage().createAuditEvent({ userId: req.user.id, action: 'CAMPAIGN_CREATE', resourceType: 'benchmark_campaign', resourceId: campaign.id, details: { targetId: target.id } });
    res.status(201).json(campaign);
  } catch (error) { next(error); }
});

campaignsRouter.get('/campaigns/:id', authenticateToken, async (req, res, next) => {
  try {
    const campaign = await getCampaignManager().get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    res.json(campaign);
  } catch (error) { next(error); }
});

campaignsRouter.post('/campaigns/:id/start', authenticateToken, async (req, res, next) => {
  try {
    const manager = getCampaignManager();
    const campaign = await manager.get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    const validation = await validateSavedCampaign(campaign, req.user.id);
    if (!validation.valid) return res.status(validation.statusCode).json({ error: validation.error });
    res.status(202).json(await manager.start(campaign.id, req.user.id, validation.data));
  } catch (error) { res.status(409).json({ error: error.message }); }
});

campaignsRouter.post('/campaigns/:id/advance', authenticateToken, async (req, res, next) => {
  try {
    const manager = getCampaignManager();
    const campaign = await manager.get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    const validation = await validateSavedCampaign(campaign, req.user.id);
    if (!validation.valid) return res.status(validation.statusCode).json({ error: validation.error });
    res.status(202).json(await manager.advance(campaign.id, req.user.id, validation.data));
  } catch (error) { res.status(409).json({ error: error.message }); }
});

campaignsRouter.post('/campaigns/:id/retry', authenticateToken, async (req, res, next) => {
  try {
    const manager = getCampaignManager();
    const campaign = await manager.get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    const validation = await validateSavedCampaign(campaign, req.user.id);
    if (!validation.valid) return res.status(validation.statusCode).json({ error: validation.error });
    res.status(202).json(await manager.retry(campaign.id, req.user.id, validation.data));
  } catch (error) { res.status(409).json({ error: error.message }); }
});

campaignsRouter.post('/campaigns/:id/cancel', authenticateToken, async (req, res, next) => {
  try {
    const campaign = await getCampaignManager().cancel(req.params.id, req.user.id);
    res.json(campaign);
  } catch (error) { res.status(409).json({ error: error.message }); }
});

campaignsRouter.get('/campaigns/:id/stages/:stageNumber/report', authenticateToken, async (req, res, next) => {
  try {
    const campaign = await getCampaignManager().get(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    const stageNumber = Number(req.params.stageNumber);
    const stage = campaign.stages.find(item => item.number === stageNumber);
    if (!stage?.report) return res.status(404).json({ error: 'Stage report is not available yet.' });
    res.setHeader('Content-Disposition', `attachment; filename="devflow-campaign-${campaign.id}-stage-${stageNumber}.json"`);
    res.json(stage.report);
  } catch (error) { next(error); }
});

export { getCampaignManager };
