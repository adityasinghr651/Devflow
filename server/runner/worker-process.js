/**
 * Standalone worker process for executing bounded load tests.
 * Runs out-of-process via child_process.fork to keep the Express API
 * server's event loop unblocked and responsive.
 * Supports fixed concurrency and staged ramp-up / steady / ramp-down workloads.
 */
import { validateTargetUrl } from '../security/ssrf.js';
import { LatencyHistogram } from './latency-histogram.js';

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
  let cancelledCount = 0;

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
          cancelledCount,
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
        await response.body?.cancel().catch(() => {});

        if (response.ok) {
          successCount++;
        } else {
          httpErrorCount++;
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
          networkErrorCount++;
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
    cancelledCount,
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
  setTimeout(() => process.exit(0), 500);
});
