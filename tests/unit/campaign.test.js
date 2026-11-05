import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionWorkload } from '../../server/runner/partitioner.js';
import { validateCampaignRun } from '../../server/runner/campaign-manager.js';
import { decryptCampaignSecrets, encryptCampaignSecrets } from '../../server/security/campaign-secrets.js';

test('Campaign quota partitioning assigns each request exactly once across workers', () => {
  const slices = partitionWorkload({ concurrency: 12, requestTarget: 1_000_000, profile: 'fixed' }, 4);
  assert.deepEqual(slices.map(slice => slice.requestTarget), [250_000, 250_000, 250_000, 250_000]);
  assert.equal(slices.reduce((sum, slice) => sum + slice.requestTarget, 0), 1_000_000);
  assert.deepEqual(partitionWorkload({ concurrency: 5, requestTarget: 11, profile: 'fixed' }, 2).map(slice => slice.requestTarget), [6, 5]);
});

test('Campaign validation requires exact requests, consistent counters, complete workers, and valid metrics', () => {
  const validRun = {
    status: 'completed', totalRequests: 10, successCount: 10, failedCount: 0,
    statusCodes: { 200: 10 }, cancelledCount: 0, histogramSampleCount: 10,
    histogramComplete: true, workerCount: 2, rps: 100, p50: 1, p95: 2, p99: 3,
    minLatency: 0.5, maxLatency: 4, meanLatency: 1.4, errorRate: 0,
  };
  assert.equal(validateCampaignRun(validRun, 10, 0).passed, true);
  assert.equal(validateCampaignRun({ ...validRun, totalRequests: 9 }, 10, 0).requestTargetReached, false);
  assert.equal(validateCampaignRun({ ...validRun, histogramSampleCount: 9 }, 10, 0).histogramConsistent, false);
  assert.equal(validateCampaignRun({ ...validRun, failedCount: 1, successCount: 9, errorRate: 10 }, 10, 0).qualityPassed, false);
  assert.equal(validateCampaignRun({ ...validRun, partialWorkers: [1], histogramComplete: false }, 10, 100).completeWorkers, false);
});

test('Campaign request credentials are encrypted at rest and decrypt after reload', () => {
  const secret = { headers: { Authorization: 'Bearer campaign-secret' }, body: '{"key":"private"}' };
  const encrypted = encryptCampaignSecrets(secret);
  assert.equal(JSON.stringify(encrypted).includes('campaign-secret'), false);
  assert.deepEqual(decryptCampaignSecrets(encrypted), secret);
});
