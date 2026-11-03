/**
 * TestCoordinator: Multi-process local worker coordinator for distributed load testing.
 *
 * Spawns N local worker child processes for a single test run, assigns partitioned
 * workload slices, aggregates asynchronous progress reports via ProgressAggregator,
 * merges worker latency histograms additively without percentile averaging,
 * and coordinates synchronized lifecycle, cancellation, and failure handling.
 */
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionWorkload } from './partitioner.js';
import { ProgressAggregator } from './progress-aggregator.js';
import { LatencyHistogram } from './latency-histogram.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultWorkerPath = path.join(__dirname, 'worker-process.js');

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timed_out']);

export class TestCoordinator {
  /**
   * @param {object} run - Run configuration and execution payload.
   * @param {object} options - Dependencies and options:
   *   - storage: Storage provider instance
   *   - events: EventEmitter instance
   *   - transitionState: Async function to transition run state
   *   - workerPath: Optional custom path to worker process script
   *   - forkFn: Optional injectable fork function (for testing)
   */
  constructor(run, options = {}) {
    this.run = run;
    this.storage = options.storage;
    this.events = options.events;
    this.transitionState = options.transitionState || (async () => {});
    this.workerPath = options.workerPath || defaultWorkerPath;
    this.forkFn = options.forkFn || fork;

    // Supported worker counts: 1, 2, or 4 (default 1)
    const rawWorkerCount = Number(run.workerCount);
    this.workerCount = [1, 2, 4].includes(rawWorkerCount) ? rawWorkerCount : 1;

    const hasStages = run.profile === 'stages' && Array.isArray(run.stages) && run.stages.length > 0;
    this.totalDurationSec = hasStages
      ? run.stages.reduce((acc, s) => acc + s.durationSec, 0)
      : (Number(run.durationSec) || 10);

    this.progressAggregator = new ProgressAggregator(this.workerCount, this.totalDurationSec);
    this.masterHistogram = new LatencyHistogram();

    this.workers = []; // Array of worker state descriptors
    this.isCancelled = false;
    this.isTerminated = false;
    this.watchdogTimeout = null;
    this.cancellationTimeout = null;
    this.startTime = null;
    this.lastProgressEmit = 0;

    this._resolveCompletion = null;
    this._completionPromise = new Promise(resolve => {
      this._resolveCompletion = resolve;
    });
  }

  /**
   * Returns PIDs of all currently active spawned worker processes.
   * @returns {number[]}
   */
  getWorkerPids() {
    return this.workers.map(w => w.child?.pid).filter(Boolean);
  }

  /**
   * Starts all worker child processes and coordinates execution.
   *
   * @returns {Promise<object>} Resolves with the final unified run summary.
   */
  async start() {
    this.startTime = Date.now();
    const slices = partitionWorkload(this.run, this.workerCount);

    // Hard watchdog timer: duration + 8s buffer
    this.watchdogTimeout = setTimeout(async () => {
      console.warn(`[TestCoordinator] Watchdog timeout triggered for run ${this.run.id}. Terminating all workers.`);
      this._terminateAllWorkers('SIGKILL');
      if (!this.isTerminated) {
        this.isTerminated = true;
        const timeoutSummary = {
          error: 'Execution exceeded allowable maximum run duration watchdog threshold.',
          finishedAt: new Date().toISOString(),
        };
        try {
          await this.transitionState(this.run.id, 'timed_out', timeoutSummary);
          this.events?.emit(`status:${this.run.id}`, { id: this.run.id, status: 'timed_out', ...timeoutSummary });
          this._resolveCompletion({ status: 'timed_out', ...timeoutSummary });
        } catch (err) {
          const message = `Test timed out, but its final status could not be saved: ${String(err?.message || err).slice(0, 200)}`;
          this.events?.emit(`error:${this.run.id}`, message);
          this._resolveCompletion({ status: 'failed', error: message });
        }
      }
    }, (this.totalDurationSec * 1000) + 8000);

    // Initialize worker descriptors and spawn child processes
    for (let i = 0; i < slices.length; i++) {
      const sliceConfig = slices[i];
      let child = null;

      try {
        child = this.forkFn(this.workerPath, [], {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
      } catch (err) {
        console.error(`[TestCoordinator] Failed to spawn worker ${i} for run ${this.run.id}:`, err);
        this._handleWorkerFailure(i, `Failed to spawn worker process: ${err.message}`);
        return this._completionPromise;
      }

      const workerDesc = {
        id: i,
        child,
        state: 'running',
        summary: null,
        exitCode: null,
      };
      this.workers.push(workerDesc);

      child.on('message', (msg) => this._handleWorkerMessage(i, msg));
      child.on('error', (err) => this._handleWorkerError(i, err));
      child.on('exit', (code, signal) => this._handleWorkerExit(i, code, signal));

      // Send start message via IPC
      try {
        child.send({
          type: 'start',
          payload: {
            ...sliceConfig,
            id: this.run.id,
            url: this.run.url,
            method: this.run.method,
            headers: this.run.headers,
            body: this.run.body,
            timeoutMs: this.run.timeoutMs || config.requestTimeoutMs || 5000,
            allowLocalTargets: config.allowLocalTargets,
          },
        });
      } catch (err) {
        this._handleWorkerFailure(i, `Failed to send start message to worker ${i}: ${err.message}`);
        return this._completionPromise;
      }
    }

    return this._completionPromise;
  }

  /**
   * Broadcasts cancellation to all active worker processes.
   */
  cancel() {
    if (this.isCancelled || this.isTerminated) return;
    this.isCancelled = true;

    for (const w of this.workers) {
      if (w.child && w.state === 'running') {
        try {
          w.child.send({ type: 'cancel' });
        } catch {}
      }
    }

    // Grace period before escalating to SIGTERM
    this.cancellationTimeout = setTimeout(() => {
      this._terminateAllWorkers('SIGTERM');
    }, 1000);
  }

  /**
   * Handles incoming IPC messages from a worker process.
   */
  _handleWorkerMessage(workerIndex, msg) {
    if (!msg || this.isTerminated) return;

    if (msg.type === 'progress' && msg.data) {
      const aggregated = this.progressAggregator.updateWorker(workerIndex, msg.data);
      const now = Date.now();
      if (now - this.lastProgressEmit >= 300) {
        this.lastProgressEmit = now;
        if (this.events) {
          this.events.emit(`progress:${this.run.id}`, aggregated);
        }
        if (this.storage) {
          this.storage.updateRun(this.run.id, aggregated).catch(() => {});
        }
      }
    } else if (msg.type === 'complete' && msg.data) {
      const worker = this.workers[workerIndex];
      if (worker && worker.state !== 'completed') {
        worker.state = 'completed';
        worker.summary = msg.data;
        if (msg.data.histogram) {
          try {
            this.masterHistogram.merge(msg.data.histogram);
          } catch (mergeErr) {
            console.error(`[TestCoordinator] Error merging histogram from worker ${workerIndex}:`, mergeErr);
          }
        }
      }
      this._checkAllFinished();
    } else if (msg.type === 'error') {
      this._handleWorkerFailure(workerIndex, msg.error || 'Worker encountered unspecified error');
    }
  }

  /**
   * Handles worker process uncaught errors.
   */
  _handleWorkerError(workerIndex, err) {
    this._handleWorkerFailure(workerIndex, `Subprocess error in worker ${workerIndex}: ${err.message}`);
  }

  /**
   * Handles worker process exit events.
   */
  _handleWorkerExit(workerIndex, code, signal) {
    const worker = this.workers[workerIndex];
    if (worker) {
      worker.exitCode = code;
      if (!this.isCancelled && (signal !== null || (code !== null && code !== 0))) {
        this._handleWorkerFailure(
          workerIndex,
          `Worker ${workerIndex} exited prematurely with exit code ${code} (signal: ${signal})`
        );
        return;
      }
      if (worker.state !== 'completed') {
        if (this.isCancelled) {
          worker.state = 'cancelled';
        } else if (code === 0 && worker.summary) {
          worker.state = 'completed';
        } else {
          this._handleWorkerFailure(
            workerIndex,
            `Worker ${workerIndex} exited prematurely with exit code ${code} (signal: ${signal})`
          );
          return;
        }
      }
    }
    this._checkAllFinished();
  }

  /**
   * Handles unexpected failure of a worker by safely stopping all remaining workers
   * and failing the overall run with diagnostic error details.
   */
  async _handleWorkerFailure(failedWorkerIndex, errorMessage) {
    if (this.isTerminated) return;
    this.isTerminated = true;

    clearTimeout(this.watchdogTimeout);
    clearTimeout(this.cancellationTimeout);

    // Stop all other running workers immediately
    this._terminateAllWorkers('SIGTERM');

    const cleanError = String(errorMessage || 'Worker failed unexpectedly').slice(0, 300);

    const failedSummary = {
      error: cleanError,
      status: 'failed',
      finishedAt: new Date().toISOString(),
    };

    try {
      await this.transitionState(this.run.id, 'failed', failedSummary);
      this.events?.emit(`status:${this.run.id}`, { id: this.run.id, ...failedSummary });
    } catch (err) {
      failedSummary.error = `${cleanError} (also could not persist failed status: ${String(err?.message || err).slice(0, 160)})`.slice(0, 300);
    }
    if (this.events) {
      this.events.emit(`error:${this.run.id}`, cleanError);
    }
    this._resolveCompletion(failedSummary);
  }

  /**
   * Checks if all workers have reached terminal state and produces unified summary.
   */
  async _checkAllFinished() {
    if (this.isTerminated) return;

    const allFinished = this.workers.length > 0 && this.workers.every(
      w => w.state === 'completed' || w.state === 'cancelled'
    );

    if (!allFinished) return;

    this.isTerminated = true;
    clearTimeout(this.watchdogTimeout);
    clearTimeout(this.cancellationTimeout);

    let totalRequests = 0;
    let successCount = 0;
    let failedCount = 0;
    let httpErrorCount = 0;
    let timeoutCount = 0;
    let networkErrorCount = 0;
    let redirectBlockedCount = 0;
    let cancelledCount = 0;
    let firstRequestStartedAt = null;
    let lastRequestCompletedAt = null;
    const statusCodes = {};
    const partialWorkers = [];

    for (const w of this.workers) {
      const data = w.summary || this.progressAggregator.workerSnapshots.get(w.id);
      if (data) {
        totalRequests += Number(data.totalRequests) || 0;
        successCount += Number(data.successCount) || 0;
        failedCount += Number(data.failedCount) || 0;
        httpErrorCount += Number(data.httpErrorCount) || 0;
        timeoutCount += Number(data.timeoutCount) || 0;
        networkErrorCount += Number(data.networkErrorCount) || 0;
        redirectBlockedCount += Number(data.redirectBlockedCount) || 0;
        cancelledCount += Number(data.cancelledCount) || 0;
        if (Number.isFinite(data.firstRequestStartedAt)) {
          firstRequestStartedAt = firstRequestStartedAt === null
            ? data.firstRequestStartedAt
            : Math.min(firstRequestStartedAt, data.firstRequestStartedAt);
        }
        if (Number.isFinite(data.lastRequestCompletedAt)) {
          lastRequestCompletedAt = lastRequestCompletedAt === null
            ? data.lastRequestCompletedAt
            : Math.max(lastRequestCompletedAt, data.lastRequestCompletedAt);
        }

        if (data.statusCodes) {
          for (const [code, count] of Object.entries(data.statusCodes)) {
            statusCodes[code] = (statusCodes[code] || 0) + Number(count || 0);
          }
        }
      }
      if (!w.summary) {
        partialWorkers.push(w.id);
      }
    }

    // In case no worker histograms were available, masterHistogram count might be 0
    if (this.masterHistogram.totalCount === 0 && totalRequests > 0) {
      for (const w of this.workers) {
        if (w.summary?.histogram) {
          try { this.masterHistogram.merge(w.summary.histogram); } catch {}
        }
      }
    }

    const measurementWindowSec = firstRequestStartedAt !== null && lastRequestCompletedAt !== null
      ? Math.max((lastRequestCompletedAt - firstRequestStartedAt) / 1000, 0.001)
      : null;
    const rps = measurementWindowSec === null
      ? 0
      : Number((totalRequests / measurementWindowSec).toFixed(2));
    const errorRate = totalRequests ? Number(((failedCount / totalRequests) * 100).toFixed(4)) : 0;
    const finalStatus = this.isCancelled ? 'cancelled' : 'completed';

    const finalSummary = {
      totalRequests,
      successCount,
      failedCount,
      httpErrorCount,
      timeoutCount,
      networkErrorCount,
      redirectBlockedCount,
      cancelledCount,
      statusCodes,
      engine: 'node',
      partialWorkers: partialWorkers.length > 0 ? partialWorkers : undefined,
      histogramComplete: partialWorkers.length === 0,
      rps,
      measurementWindowSec,
      p50: this.masterHistogram.getPercentile(0.50),
      p95: this.masterHistogram.getPercentile(0.95),
      p99: this.masterHistogram.getPercentile(0.99),
      errorRate,
      status: finalStatus,
      finishedAt: new Date().toISOString(),
      currentConcurrency: 0,
      progressPercent: 100,
    };

    try {
      await this.transitionState(this.run.id, finalStatus, finalSummary);
    } catch (err) {
      const message = `Test execution finished, but results could not be saved: ${String(err?.message || err).slice(0, 220)}`;
      this.events?.emit(`error:${this.run.id}`, message);
      this._resolveCompletion({ status: 'failed', error: message });
      return;
    }
    if (this.events) {
      if (finalStatus === 'completed') {
        this.events.emit(`complete:${this.run.id}`, finalSummary);
      }
      this.events.emit(`status:${this.run.id}`, { id: this.run.id, ...finalSummary });
    }
    this._resolveCompletion(finalSummary);
  }

  /**
   * Safely terminates all child processes with the specified signal.
   */
  _terminateAllWorkers(signal = 'SIGTERM') {
    for (const w of this.workers) {
      if (w.child) {
        try {
          w.child.kill(signal);
        } catch {}
      }
    }
  }
}

