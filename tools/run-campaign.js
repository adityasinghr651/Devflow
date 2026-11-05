import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const args = process.argv.slice(2);
const hasFlag = flag => args.includes(flag);
function option(name, envName, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || '' : process.env[envName] || fallback;
}

if (!hasFlag('--confirm-large')) {
  console.error('Refusing to start: pass --confirm-large to authorize the 2.5 million total request campaign.');
  process.exit(2);
}

const apiBase = option('--api', 'DEVFLOW_API_URL', 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '');
const email = option('--email', 'DEVFLOW_EMAIL');
const password = option('--password', 'DEVFLOW_PASSWORD');
const tokenFromEnv = process.env.DEVFLOW_TOKEN;
const concurrencyRaw = option('--concurrency', 'DEVFLOW_CAMPAIGN_CONCURRENCY');
const workerCount = Number(option('--workers', 'DEVFLOW_CAMPAIGN_WORKERS'));
const timeoutMs = Number(option('--timeout-ms', 'DEVFLOW_CAMPAIGN_TIMEOUT_MS', '5000'));
const warmupSec = Number(option('--warmup-sec', 'DEVFLOW_CAMPAIGN_WARMUP_SEC', '0'));
const rampUpSec = Number(option('--ramp-up-sec', 'DEVFLOW_CAMPAIGN_RAMP_UP_SEC', '0'));
const maxErrorRatePercent = Number(option('--max-error-rate', 'DEVFLOW_CAMPAIGN_MAX_ERROR_RATE', '0'));
const targetPath = option('--path', 'DEVFLOW_CAMPAIGN_PATH', '/health');
const method = option('--method', 'DEVFLOW_CAMPAIGN_METHOD', 'GET').toUpperCase();
const outputDir = path.resolve(option('--output', 'DEVFLOW_CAMPAIGN_OUTPUT', 'benchmarks/results'));
const apiHeaders = process.env.DEVFLOW_CAMPAIGN_HEADERS ? JSON.parse(process.env.DEVFLOW_CAMPAIGN_HEADERS) : {};
const requestBody = process.env.DEVFLOW_CAMPAIGN_BODY || undefined;

if ((!tokenFromEnv && (!email || !password)) || !concurrencyRaw || ![1, 2, 4].includes(workerCount)) {
  console.error('Set DEVFLOW_TOKEN or DEVFLOW_EMAIL and DEVFLOW_PASSWORD, plus DEVFLOW_CAMPAIGN_CONCURRENCY (four comma-separated VU counts) and DEVFLOW_CAMPAIGN_WORKERS (1, 2, or 4).');
  process.exit(2);
}
const stageConcurrency = concurrencyRaw.split(',').map(value => Number(value.trim()));
if (stageConcurrency.length !== 4 || stageConcurrency.some(value => !Number.isInteger(value) || value < workerCount || value > 20)) {
  console.error('Concurrency must provide four integers from the selected worker count through 20, for example 4,8,12,16.');
  process.exit(2);
}

let token = tokenFromEnv;
let campaignId = null;
let cancelOnSignal = false;

async function api(route, { method: httpMethod = 'GET', body } = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    method: httpMethod,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${httpMethod} ${route} failed with ${response.status}.`);
  return result;
}

async function cancelActiveCampaign() {
  if (!campaignId || !token || !cancelOnSignal) return;
  cancelOnSignal = false;
  try { await api(`/campaigns/${campaignId}/cancel`, { method: 'POST', body: {} }); console.error('\nCampaign cancellation requested.'); }
  catch (error) { console.error(`\nCould not request campaign cancellation: ${error.message}`); }
}
process.once('SIGINT', async () => { await cancelActiveCampaign(); process.exit(130); });
process.once('SIGTERM', async () => { await cancelActiveCampaign(); process.exit(143); });

try {
  const health = await fetch('http://127.0.0.1:5050/health');
  if (!health.ok) throw new Error('Controlled target did not return a healthy response. Start it with npm run dev:all.');
  const healthPayload = await health.json();
  if (healthPayload.status !== 'ok') throw new Error('The local controlled target health response is invalid.');

  if (!token) {
    const auth = await api('/auth/login', { method: 'POST', body: { email, password } });
    token = auth.token;
  }
  const targets = await api('/targets');
  let target = targets.find(item => item.url.replace(/\/$/, '') === 'http://127.0.0.1:5050');
  if (!target) target = await api('/targets', { method: 'POST', body: { name: 'DevFlow controlled benchmark target', url: 'http://127.0.0.1:5050', environment: 'Local' } });

  const campaign = await api('/campaigns', { method: 'POST', body: {
    name: '1M Request Controlled Benchmark Campaign', targetId: target.id,
    path: targetPath, method, stageConcurrency, workerCount, timeoutMs,
    warmupSec, rampUpSec, maxErrorRatePercent, headers: apiHeaders,
    body: requestBody, authorized: true,
  } });
  campaignId = campaign.id;
  cancelOnSignal = true;
  console.log(`Campaign ${campaignId} created for ${target.url}${targetPath}.`);
  console.log(`Load profile: ${stageConcurrency.join(' → ')} VUs across ${workerCount} worker process(es); request timeout ${timeoutMs} ms.`);
  console.log(`Reports will be written to ${outputDir}. No external target is used by this command.`);

  let operation = 'start';
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      await api(`/campaigns/${campaignId}/${operation}`, { method: 'POST', body: {} });
      const currentStageNumber = operation === 'start' ? 1 : Number((await api(`/campaigns/${campaignId}`)).currentStage) + 1;
      console.log(`Stage ${currentStageNumber} started.`);
      let current;
      let lastRequests = -1;
      do {
        await new Promise(resolve => setTimeout(resolve, 2000));
        current = await api(`/campaigns/${campaignId}`);
        const stage = current.stages[current.currentStage];
        if (stage?.currentRunId) {
          const run = await api(`/runs/${stage.currentRunId}`);
          if (run.totalRequests !== lastRequests) {
            lastRequests = run.totalRequests;
            console.log(`  ${stage.status}: ${run.totalRequests.toLocaleString()} / ${stage.requestTarget.toLocaleString()} requests · ${Number(run.rps || 0).toFixed(1)} req/s`);
          }
        }
      } while (['running', 'validating'].includes(current.status));

      const stage = current.stages[current.currentStage];
      if (stage?.report) {
        await fs.mkdir(outputDir, { recursive: true });
        const reportPath = path.join(outputDir, `campaign-${campaignId}-stage-${stage.number}.json`);
        await fs.writeFile(reportPath, `${JSON.stringify(stage.report, null, 2)}${os.EOL}`, 'utf8');
        console.log(`Stage ${stage.number} ${stage.status}. Persisted report: ${reportPath}`);
        console.log(JSON.stringify(stage.report.performance, null, 2));
      } else {
        console.error(`Stage ${stage?.number || '?'} ended ${current.status}: ${current.error || 'Report unavailable.'}`);
      }

      if (current.status === 'completed') {
        cancelOnSignal = false;
        console.log(`Campaign ${campaignId} completed all four stages.`);
        break;
      }
      if (current.status !== 'awaiting_approval') {
        cancelOnSignal = false;
        process.exitCode = 1;
        break;
      }
      const answer = await prompt.question(`Stage ${stage.number} report is saved. Approve and start Stage ${stage.number + 1} (${current.stages[stage.number].requestTarget.toLocaleString()} requests)? Type yes to continue: `);
      if (answer.trim().toLowerCase() !== 'yes') {
        cancelOnSignal = false;
        console.log(`Campaign paused with Stage ${stage.number} report saved. Approve the next stage in the Campaigns page when ready.`);
        break;
      }
      operation = 'advance';
    }
  } finally { prompt.close(); }
} catch (error) {
  if (campaignId && cancelOnSignal) await cancelActiveCampaign();
  cancelOnSignal = false;
  console.error(`Campaign failed: ${error.message}`);
  process.exitCode = 1;
}
