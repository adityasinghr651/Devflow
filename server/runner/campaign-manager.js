import { randomUUID } from 'node:crypto';
import { decryptCampaignSecrets, encryptCampaignSecrets } from '../security/campaign-secrets.js';
import { sanitizeHeadersForStorage } from '../security/validation.js';
import { config } from '../config.js';

export const CAMPAIGN_STAGE_TARGETS = [250_000, 500_000, 750_000, 1_000_000];
const ACTIVE_CAMPAIGN_STATES = new Set(['pending', 'running', 'validating', 'awaiting_approval']);
const RETRYABLE_STAGE_STATES = new Set(['failed', 'cancelled', 'completed_with_errors']);

export function validateCampaignRun(run, plannedRequests, maxErrorRatePercent = 0) {
  const reasons = [];
  const requestTargetReached = run.totalRequests === plannedRequests;
  const countersConsistent = run.successCount + run.failedCount === run.totalRequests
    && Object.values(run.statusCodes || {}).reduce((sum, value) => sum + Number(value || 0), 0) === run.totalRequests + (run.cancelledCount || 0)
    && run.failedCount === (run.httpErrorCount || 0) + (run.timeoutCount || 0) + (run.networkErrorCount || 0) + (run.redirectBlockedCount || 0) + (run.assertionFailureCount || 0);
  const histogramConsistent = run.histogramSampleCount === run.totalRequests;
  const completeWorkers = !run.partialWorkers?.length && run.histogramComplete !== false;
  const metricsValid = run.workerCount >= 1 && Number.isFinite(run.rps) && run.rps > 0
    && [run.p50, run.p95, run.p99].every(Number.isFinite)
    && run.p50 <= run.p95 && run.p95 <= run.p99
    && (run.meanLatency == null || Number.isFinite(run.meanLatency))
    && Number.isFinite(run.maxLatency) && run.maxLatency >= (run.minLatency || 0)
    && (run.totalRequests === 0 || run.minLatency != null);
  if (run.status !== 'completed') reasons.push(`Run ended with status ${run.status}.`);
  if (!requestTargetReached) reasons.push(`Expected ${plannedRequests} requests but measured ${run.totalRequests}.`);
  if (!countersConsistent || !histogramConsistent) reasons.push('Request, response, status-code, and latency histogram counts are inconsistent.');
  if (!completeWorkers) reasons.push('One or more workers did not provide complete final metrics.');
  if (!metricsValid) reasons.push('Final throughput or latency metrics are unavailable or invalid.');
  const qualityPassed = Number(run.errorRate) <= maxErrorRatePercent;
  if (!qualityPassed) reasons.push(`Error rate ${run.errorRate}% exceeds the configured ${maxErrorRatePercent}% maximum.`);
  const criteriaPassed = run.status === 'completed' && requestTargetReached && countersConsistent && histogramConsistent && completeWorkers && metricsValid;
  return { passed: criteriaPassed && qualityPassed, criteriaPassed, qualityPassed, requestTargetReached, countersConsistent, histogramConsistent, completeWorkers, metricsValid, reasons };
}

export class BenchmarkCampaignManager {
  constructor(storage, runner, options = {}) {
    this.storage = storage;
    this.runner = runner;
    this.stageTargets = options.stageTargets || CAMPAIGN_STAGE_TARGETS;
    this.busy = new Set();
    this.creatingUsers = new Set();
  }

  publicCampaign(campaign) {
    if (!campaign) return null;
    const { secretsEncrypted, ...publicData } = campaign;
    return publicData;
  }

  async create(userId, settings, secrets = {}) {
    if (this.creatingUsers.has(userId)) throw new Error('A campaign creation is already in progress for this user.');
    this.creatingUsers.add(userId);
    try {
      const existing = await this.storage.getCampaigns(userId);
      if (existing.some(campaign => ACTIVE_CAMPAIGN_STATES.has(campaign.status))) throw new Error('Finish, cancel, or retry the active campaign before creating another.');
      const now = new Date().toISOString();
      const campaign = {
      id: randomUUID(), userId, name: settings.name, targetId: settings.targetId,
      targetName: settings.targetName, targetBaseUrl: settings.targetBaseUrl,
      path: settings.path, method: settings.method, concurrency: settings.concurrency,
      stageConcurrency: settings.stageConcurrency, workerCount: settings.workerCount,
      timeoutMs: settings.timeoutMs, warmupSec: settings.warmupSec, rampUpSec: settings.rampUpSec,
      headers: sanitizeHeadersForStorage(settings.headers), hasBody: Boolean(settings.body),
      maxErrorRatePercent: settings.maxErrorRatePercent,
      status: 'pending', currentStage: 0, error: null,
      stages: this.stageTargets.map((requestTarget, index) => ({
        number: index + 1, requestTarget,
        concurrency: settings.stageConcurrency[index], status: 'pending', runIds: [],
        startedAt: null, finishedAt: null, validation: null, report: null,
      })),
      secretsEncrypted: encryptCampaignSecrets(secrets), createdAt: now, updatedAt: now,
      };
      return this.publicCampaign(await this.storage.createCampaign(campaign));
    } finally { this.creatingUsers.delete(userId); }
  }

  async get(id, userId) { return this.publicCampaign(await this.storage.getCampaignById(id, userId)); }

  async list(userId) { return (await this.storage.getCampaigns(userId)).map(campaign => this.publicCampaign(campaign)); }

  async recoverAfterRestart() {
    const campaigns = await this.storage.getCampaigns();
    let cleaned = 0;
    for (const campaign of campaigns) {
      if (!['running', 'validating'].includes(campaign.status)) continue;
      const stageIndex = campaign.currentStage;
      const stage = campaign.stages?.[stageIndex];
      const run = campaign.currentRunId ? await this.storage.getRunById(campaign.currentRunId, campaign.userId) : null;
      if (stage) {
        stage.status = 'failed';
        stage.error = 'Campaign interrupted by a server restart; inspect the saved partial run before retrying.';
        stage.finishedAt = run?.finishedAt || new Date().toISOString();
        if (run) {
          const validation = validateCampaignRun(run, stage.requestTarget, campaign.maxErrorRatePercent);
          stage.validation = validation;
          stage.report = this._buildReport(campaign, stage, run, validation, null);
        }
      }
      campaign.status = 'failed';
      campaign.error = stage?.error || 'Campaign interrupted by a server restart.';
      campaign.currentRunId = null;
      await this.storage.updateCampaign(campaign.id, campaign, campaign.userId);
      cleaned++;
    }
    return cleaned;
  }

  async start(id, userId, validationData) {
    const campaign = await this.storage.getCampaignById(id, userId);
    if (!campaign || campaign.status !== 'pending') throw new Error('Campaign is not ready to start.');
    return this._launchStage(campaign, 0, validationData);
  }

  async advance(id, userId, validationData) {
    const campaign = await this.storage.getCampaignById(id, userId);
    if (!campaign || campaign.status !== 'awaiting_approval') throw new Error('Campaign has no successful stage awaiting approval.');
    const nextIndex = campaign.stages.findIndex(stage => stage.status === 'pending');
    if (nextIndex < 0) throw new Error('No pending stage is available.');
    return this._launchStage(campaign, nextIndex, validationData);
  }

  async retry(id, userId, validationData) {
    const campaign = await this.storage.getCampaignById(id, userId);
    if (!campaign || !RETRYABLE_STAGE_STATES.has(campaign.stages?.[campaign.currentStage]?.status)) throw new Error('The current stage is not eligible for retry.');
    const stage = campaign.stages[campaign.currentStage];
    stage.status = 'pending'; stage.error = null; stage.validation = null; stage.finishedAt = null; stage.report = null;
    campaign.status = 'pending'; campaign.error = null;
    const saved = await this.storage.updateCampaign(id, campaign, userId);
    return this._launchStage(saved, saved.currentStage, validationData);
  }

  async cancel(id, userId) {
    const campaign = await this.storage.getCampaignById(id, userId);
    if (!campaign || !ACTIVE_CAMPAIGN_STATES.has(campaign.status)) throw new Error('Campaign is not active.');
    if (campaign.currentRunId) await this.runner.cancelRun(campaign.currentRunId);
    else {
      campaign.status = 'cancelled';
      campaign.error = 'Campaign cancelled by user before the next stage was approved.';
      await this.storage.updateCampaign(id, campaign, userId);
    }
    return this.get(id, userId);
  }

  async _launchStage(campaign, stageIndex, validationData) {
    if (this.busy.has(campaign.id)) throw new Error('A stage operation is already in progress.');
    this.busy.add(campaign.id);
    try {
      const stage = campaign.stages[stageIndex];
      const runId = randomUUID();
      const now = new Date().toISOString();
      const secrets = decryptCampaignSecrets(campaign.secretsEncrypted);
      const run = {
        id: runId, userId: campaign.userId, targetId: campaign.targetId,
        targetName: campaign.targetName, url: validationData.url, method: campaign.method,
        concurrency: stage.concurrency, durationSec: 3600, requestTarget: stage.requestTarget,
        warmupSec: campaign.warmupSec, rampUpSec: campaign.rampUpSec,
        warmupRequests: 0, profile: 'fixed', stages: [], headers: campaign.headers,
        body: campaign.hasBody ? '[encrypted campaign request body]' : null,
        timeoutMs: campaign.timeoutMs, workerCount: campaign.workerCount,
        campaignId: campaign.id, campaignStage: stage.number, status: 'queued', startedAt: now,
        totalRequests: 0, successCount: 0, failedCount: 0, httpErrorCount: 0,
        timeoutCount: 0, networkErrorCount: 0, redirectBlockedCount: 0,
        assertionFailureCount: 0, cancelledCount: 0, rps: 0, p50: 0, p95: 0, p99: 0,
        errorRate: 0, statusCodes: {},
      };
      const account = await this.storage.getUserById(campaign.userId);
      const quotaLimit = account?.tier === 'admin' ? Infinity : config.paidRunQuota;
      const persistedRun = await this.storage.createRun(run, { quotaLimit });
      if (!persistedRun) throw new Error('Pro plan run quota reached.');
      stage.status = 'running'; stage.runIds.push(runId); stage.currentRunId = runId; stage.startedAt = now;
      campaign.currentStage = stageIndex; campaign.currentRunId = runId; campaign.status = 'running'; campaign.error = null;
      await this.storage.updateCampaign(campaign.id, campaign, campaign.userId);
      const eventKey = `status:${runId}`;
      const onStatus = data => {
        if (!['completed', 'failed', 'cancelled', 'timed_out'].includes(data.status)) return;
        this.runner.events.removeListener(eventKey, onStatus);
        void this._finishStage(campaign.id, campaign.userId, stageIndex, runId, campaign.maxErrorRatePercent)
          .catch(error => this._markFinalizationFailure(campaign.id, campaign.userId, stageIndex, error));
      };
      this.runner.events.on(eventKey, onStatus);
      await this.runner.enqueueRun({ ...run, headers: secrets.headers || {}, body: secrets.body || null, maxWallDurationSec: validationData.maxWallDurationSec || 21600 });
      return this.get(campaign.id, campaign.userId);
    } finally { this.busy.delete(campaign.id); }
  }

  async _finishStage(campaignId, userId, stageIndex, runId, maxErrorRatePercent) {
    const campaign = await this.storage.getCampaignById(campaignId, userId);
    if (!campaign) return;
    const run = await this.storage.getRunById(runId, userId);
    if (!run) throw new Error('Persisted stage run could not be loaded.');
    const stage = campaign.stages[stageIndex];
    stage.status = 'validating';
    campaign.status = 'validating';
    await this.storage.updateCampaign(campaignId, campaign, userId);

    const validation = validateCampaignRun(run, stage.requestTarget, maxErrorRatePercent);
    const previous = [...campaign.stages.slice(0, stageIndex)].reverse().find(item => item.status === 'successful');
    const report = this._buildReport(campaign, stage, run, validation, previous);
    stage.finishedAt = run.finishedAt || new Date().toISOString();
    stage.validation = validation;
    stage.report = report;
    stage.status = run.status === 'cancelled' ? 'cancelled'
      : run.status !== 'completed' || !validation.criteriaPassed ? 'failed'
        : !validation.qualityPassed ? 'completed_with_errors' : 'successful';
    stage.error = validation.reasons.length ? validation.reasons.join(' ') : null;
    campaign.currentRunId = null;
    if (stage.status === 'successful') {
      campaign.status = stageIndex === campaign.stages.length - 1 ? 'completed' : 'awaiting_approval';
      campaign.error = null;
    } else {
      campaign.status = stage.status;
      campaign.error = stage.error || `Stage ${stage.number} ${stage.status}.`;
    }
    // A successful state and its generated report are committed in the same write.
    await this.storage.updateCampaign(campaignId, campaign, userId);
  }

  async _markFinalizationFailure(campaignId, userId, stageIndex, error) {
    console.error(`[Campaign] Could not finalize stage ${stageIndex + 1}: ${error.message}`);
    try {
      const campaign = await this.storage.getCampaignById(campaignId, userId);
      if (!campaign) return;
      const stage = campaign.stages[stageIndex];
      stage.status = 'failed';
      stage.error = `Final metrics or report could not be persisted: ${String(error.message || error).slice(0, 240)}`;
      stage.finishedAt ||= new Date().toISOString();
      campaign.status = 'failed'; campaign.error = stage.error; campaign.currentRunId = null;
      await this.storage.updateCampaign(campaignId, campaign, userId);
    } catch (persistError) {
      console.error(`[Campaign] Failed to persist the finalization error: ${persistError.message}`);
    }
  }

  _buildReport(campaign, stage, run, validation, previousStage) {
    const comparison = previousStage?.report?.performance;
    const delta = (current, previous) => previous == null || previous === 0 ? null : Number(((current - previous) / Math.abs(previous) * 100).toFixed(2));
    const durationSec = run.startedAt && run.finishedAt ? Math.max(0, (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000) : null;
    return {
      campaign: { id: campaign.id, name: campaign.name, stage: stage.number, stageCount: campaign.stages.length, plannedRequests: stage.requestTarget, actualRequests: run.totalRequests, runId: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt || null, version: run.environmentMetadata?.runnerVersion || 'unknown', commit: run.environmentMetadata?.runnerCommit || 'unknown' },
      workload: { targetUrl: run.url, method: run.method, concurrency: stage.concurrency, workerCount: run.workerCount, timeoutMs: run.timeoutMs, profile: 'fixed request quota', headers: campaign.headers, hasBody: campaign.hasBody, warmupSec: campaign.warmupSec, warmupRequests: run.warmupRequests || 0, rampUpSec: campaign.rampUpSec, durationSec },
      performance: { successCount: run.successCount, failedCount: run.failedCount, timeoutCount: run.timeoutCount || 0, errorRate: run.errorRate, rps: run.rps, p50: run.p50, p95: run.p95, p99: run.p99, minLatency: run.minLatency ?? null, maxLatency: run.maxLatency ?? null, meanLatency: run.meanLatency ?? null, totalDurationSec: durationSec, workerCount: run.workerCount, concurrency: stage.concurrency },
      validation: { passed: validation.passed, qualityPassed: validation.qualityPassed, criteria: { exactRequestTarget: validation.requestTargetReached, countersConsistent: validation.countersConsistent, histogramConsistent: validation.histogramConsistent, completeWorkers: validation.completeWorkers, metricsValid: validation.metricsValid, persistedRun: true, maxErrorRatePercent: campaign.maxErrorRatePercent }, warnings: validation.reasons },
      comparison: previousStage ? { previousStage: previousStage.number, previousActualRequests: previousStage.report.campaign.actualRequests, rpsChangePercent: delta(run.rps, comparison.rps), p95ChangePercent: delta(run.p95, comparison.p95), p99ChangePercent: delta(run.p99, comparison.p99), errorRateChangePercentPoints: Number((run.errorRate - comparison.errorRate).toFixed(4)) } : { previousStage: null, note: 'No previous successful stage exists.' },
      environment: run.environmentMetadata || null,
      unavailableMetrics: ['Live CPU and process memory utilization are not sampled by the runner.'],
      generatedAt: new Date().toISOString(),
    };
  }
}
