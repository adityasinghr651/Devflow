/**
 * Standalone worker process for executing bounded load tests.
 * Runs out-of-process via child_process.fork to keep the Express API
 * server's event loop unblocked and responsive.
 * Supports fixed concurrency and staged ramp-up / steady / ramp-down workloads.
 */
import { validateTargetUrl } from '../security/ssrf.js';
import { LatencyHistogram } from './latency-histogram.js';
import { isDeepStrictEqual } from 'node:util';

const MAX_ASSERTION_BODY_BYTES = 64 * 1024;

async function readBoundedBody(response) {
  if (!response.body) return { text: '', tooLarge: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ASSERTION_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { text: '', tooLarge: true };
      }
      chunks.push(Buffer.from(value));
    }
    return { text: Buffer.concat(chunks).toString('utf8'), tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

function lookupJsonPath(value, path) {
  const tokens = path.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+/g) || [];
  let current = value;
  for (const token of tokens) {
    const key = /^\d+$/.test(token) ? Number(token) : token;
    if (current === null || current === undefined || !Object.hasOwn(Object(current), key)) return { exists: false };
    current = current[key];
  }
  return { exists: true, value: current };
}

async function responseAssertionsPass(response, assertions = {}) {
  const configured = assertions.status !== undefined || assertions.bodyContains !== undefined || (assertions.jsonPath?.length || 0) > 0;
  if (!configured) {
    await response.body?.cancel().catch(() => {});
    return true;
  }
  if (assertions.status !== undefined && response.status !== assertions.status) {
    await response.body?.cancel().catch(() => {});
    return false;
  }
  const { text, tooLarge } = await readBoundedBody(response);
  if (tooLarge) return false;
  if (assertions.bodyContains !== undefined && !text.includes(assertions.bodyContains)) return false;
  if (assertions.jsonPath?.length) {
    let json;
    try { json = JSON.parse(text); } catch { return false; }
    for (const assertion of assertions.jsonPath) {
      const result = lookupJsonPath(json, assertion.path);
      if (assertion.op === 'exists' && !result.exists) return false;
      if (assertion.op === 'notExists' && result.exists) return false;
      if (assertion.op === 'equals' && (!result.exists || !isDeepStrictEqual(result.value, assertion.equals))) return false;
    }
  }
  return true;
}

let isCancelled = false;
const abortController = new AbortController();

function getStagedConcurrency(elapsedSec, stages) {
  let accumSec = 0;
  let prevTarget = 1;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageStartSec = accumSec;
    const stageEndSec = accumSec + stage.durationSec;

    if (elapsedSec <= stageEndSec || i === stages.length - 1) {
      const stageElapsed = Math.max(0, elapsedSec - stageStartSec);
      const ratio = Math.min(1, stageElapsed / Math.max(stage.durationSec, 0.001));
      const interpolated = prevTarget + ratio * (stage.target - prevTarget);
      return {
        concurrency: Math.max(0, Math.round(interpolated)),
        stageIndex: i,
      };
    }

    prevTarget = stage.target;
    accumSec = stageEndSec;
  }

  return { concurrency: 0, stageIndex: stages.length - 1 };
}

async function runWorker({
  id,
  workerIndex = 0,
  url,
  method,
  concurrency,
  durationSec,
  profile = 'fixed',
  stages = [],
  headers = {},
  body = null,
  timeoutMs = 5000,
  assertions = {},
  allowLocalTargets = true,
}) {
  // Pre-flight runtime destination verification against DNS rebinding / TOCTOU
  const preCheck = await validateTargetUrl(url, { allowLocalTargets });
  if (!preCheck.valid) {
    if (process.send) {
      process.send({
        type: 'error',
        workerIndex,
        error: `Runtime security check failed: ${preCheck.error}`,
      });
    }
    process.exit(1);
    return;
  }

  const hasStages = profile === 'stages' && Array.isArray(stages) && stages.length > 0;
  const totalDurationSec = hasStages
    ? stages.reduce((acc, s) => acc + s.durationSec, 0)
    : durationSec;

  const peakConcurrency = hasStages
    ? Math.max(...stages.map(s => s.target), 0)
    : Math.max(0, concurrency);

  const deadline = Date.now() + totalDurationSec * 1000;
  const startTime = Date.now();
  const latencyHistogram = new LatencyHistogram();
  const statusCodes = {};
  let totalRequests = 0;
  let successCount = 0;
  let failedCount = 0;
  let httpErrorCount = 0;
  let timeoutCount = 0;
  let networkErrorCount = 0;
  let redirectBlockedCount = 0;
  let assertionFailureCount = 0;
  let cancelledCount = 0;
  let firstRequestStartedAt = null;
  let lastRequestCompletedAt = null;

  let lastProgressReport = Date.now();
  let currentActiveConcurrency = hasStages ? (stages[0]?.target || 0) : concurrency;
  let currentStageIndex = 0;

  // Prepare normalized request headers
  const reqHeaders = {
    'User-Agent': 'ServerTest-Runner/1.0',
    'Accept': '*/*',
    ...headers,
  };

  if (body && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  function sendProgress(force = false) {
    const now = Date.now();
    if (!force && now - lastProgressReport < 350) return;
    lastProgressReport = now;

    const elapsedSec = Math.max((now - startTime) / 1000, 0.001);
    const rps = Number((totalRequests / elapsedSec).toFixed(2));
    const errorRate = totalRequests ? Number(((failedCount / totalRequests) * 100).toFixed(4)) : 0;

    if (process.send) {
      process.send({
        type: 'progress',
        workerIndex,
        data: {
          totalRequests,
          successCount,
          failedCount,
          httpErrorCount,
          timeoutCount,
          networkErrorCount,
          redirectBlockedCount,
          assertionFailureCount,
          cancelledCount,
          firstRequestStartedAt,
          lastRequestCompletedAt,
          rps,
          errorRate,
          statusCodes: { ...statusCodes },
          currentConcurrency: currentActiveConcurrency,
          currentStageIndex: hasStages ? currentStageIndex : null,
          elapsedSec: Number(elapsedSec.toFixed(1)),
          progressPercent: Math.min(100, Number(((elapsedSec / totalDurationSec) * 100).toFixed(1))),
        },
      });
    }
  }

  async function workerSlot(slotIndex) {
    while (Date.now() < deadline && !isCancelled) {
      const nowSec = (Date.now() - startTime) / 1000;

      if (hasStages) {
        const stageInfo = getStagedConcurrency(nowSec, stages);
        currentActiveConcurrency = stageInfo.concurrency;
        currentStageIndex = stageInfo.stageIndex;

        // If this worker slot is currently above active target concurrency, sleep briefly
        if (slotIndex >= currentActiveConcurrency) {
          await new Promise(r => setTimeout(r, 60));
          continue;
        }
      }

      const reqStart = performance.now();
      const reqStartEpoch = Date.now();
      let code = 'network_error';
      let isAbortedReq = false;

      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const combinedSignal = AbortSignal.any([abortController.signal, timeoutSignal]);

        const fetchOptions = {
          method,
          headers: reqHeaders,
          signal: combinedSignal,
          redirect: 'error',
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          fetchOptions.body = body;
        }

        const response = await fetch(url, fetchOptions);
        code = String(response.status);
        const expectedStatus = assertions.status !== undefined ? response.status === assertions.status : response.ok;
        const assertionsPass = expectedStatus ? await responseAssertionsPass(response, { ...assertions, status: undefined }) : (await response.body?.cancel().catch(() => {}), false);
        if (expectedStatus && !assertionsPass) {
          assertionFailureCount++;
          failedCount++;
        }

        if (expectedStatus && assertionsPass) {
          successCount++;
        } else if (!expectedStatus && !response.ok) {
          httpErrorCount++;
          failedCount++;
        } else if (!expectedStatus) {
          assertionFailureCount++;
          failedCount++;
        }
      } catch (err) {
        if (err.name === 'AbortError' && isCancelled) {
          code = 'cancelled';
          cancelledCount++;
          isAbortedReq = true;
        } else if (err.name === 'TimeoutError') {
          code = 'timeout';
          timeoutCount++;
          failedCount++;
        } else if (err.name === 'TypeError' && (err.cause?.message?.includes('redirect') || err.message?.includes('redirect'))) {
          code = 'redirect_blocked';
          redirectBlockedCount++;
          failedCount++;
        } else {
          code = 'network_error';
          networkErrorCount++;
          failedCount++;
        }
      }

      statusCodes[code] = (statusCodes[code] || 0) + 1;

      // Cancelled in-flight requests must NOT be recorded in latency histogram
      // and must NOT be in totalRequests (denominator for error rate).
      if (!isAbortedReq) {
        const elapsed = Math.max(0, performance.now() - reqStart);
        latencyHistogram.record(elapsed);
        totalRequests++;
        firstRequestStartedAt = firstRequestStartedAt === null
          ? reqStartEpoch
          : Math.min(firstRequestStartedAt, reqStartEpoch);
        lastRequestCompletedAt = Date.now();
      }

      if (totalRequests % 5 === 0) {
        sendProgress();
      }
    }
  }

  // Launch slots up to peak concurrency or idle wait if 0 concurrency assigned
  if (peakConcurrency === 0) {
    while (Date.now() < deadline && !isCancelled) {
      await new Promise(r => setTimeout(r, 100));
      sendProgress();
    }
  } else {
    await Promise.all(
      Array.from({ length: peakConcurrency }, (_, idx) => workerSlot(idx))
    );
  }

  const totalElapsedSec = Math.max((Date.now() - startTime) / 1000, 0.001);

  const finalSummary = {
    workerIndex,
    totalRequests,
    successCount,
    failedCount,
    httpErrorCount,
    timeoutCount,
    networkErrorCount,
    redirectBlockedCount,
    assertionFailureCount,
    cancelledCount,
    firstRequestStartedAt,
    lastRequestCompletedAt,
    statusCodes,
    rps: Number((totalRequests / totalElapsedSec).toFixed(2)),
    p50: latencyHistogram.getPercentile(0.50),
    p95: latencyHistogram.getPercentile(0.95),
    p99: latencyHistogram.getPercentile(0.99),
    errorRate: totalRequests ? Number(((failedCount / totalRequests) * 100).toFixed(4)) : 0,
    status: isCancelled ? 'cancelled' : 'completed',
    finishedAt: new Date().toISOString(),
    currentConcurrency: 0,
    progressPercent: 100,
    histogram: latencyHistogram.toJSON(),
  };

  if (process.send) {
    const exitTimeout = setTimeout(() => process.exit(0), 1000);
    process.send({
      type: 'complete',
      workerIndex,
      data: finalSummary,
    }, () => {
      clearTimeout(exitTimeout);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('message', message => {
  if (message?.type === 'start') {
    runWorker(message.payload).catch(err => {
      if (process.send) {
        process.send({
          type: 'error',
          error: err.message,
        });
      }
      process.exit(1);
    });
  } else if (message?.type === 'cancel') {
    isCancelled = true;
    abortController.abort();
  }
});

process.on('SIGTERM', () => {
  isCancelled = true;
  abortController.abort();
  process.exit(143);
});
