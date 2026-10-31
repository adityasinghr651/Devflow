import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getStorage } from '../storage/index.js';
import { isK6Available, executeK6Run } from './k6-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.join(__dirname, 'worker-process.js');

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timed_out']);

export class RunnerManager {
  constructor(storage = null) {
    this.storage = storage || getStorage();
    this.activeRuns = new Map(); // runId -> { type, child, cancel, timeoutId }
    this.queue = [];
    this.maxActive = config.maxActiveRuns || 1;
    this.runningCount = 0;
    this.dispatchedRuns = new Set();
    this.events = new EventEmitter();
    this.events.setMaxListeners(200);
  }

  async startupRecovery() {
    const cleaned = await this.storage.cleanupStaleRuns();
    if (cleaned > 0) {
      console.log(`[RunnerManager] Startup recovery: cleaned up ${cleaned} stale active runs.`);
    }
  }

  getEngineName() {
    return this.useK6 ? 'k6-subprocess' : 'node-subprocess-worker';
  }

  async enqueueRun(run) {
    if (this.dispatchedRuns.has(run.id)) {
      console.warn(`[RunnerManager] Run ${run.id} is already dispatched. Ignoring duplicate enqueue.`);
      return run;
    }
    this.dispatchedRuns.add(run.id);
    this.queue.push(run.id);
    this._processNext();
    return run;
  }

  async cancelRun(id) {
    const qIdx = this.queue.indexOf(id);
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1);
      await this._transitionState(id, 'cancelled', {
        finishedAt: new Date().toISOString(),
      });
      return { success: true, status: 'cancelled' };
    }

    const active = this.activeRuns.get(id);
    if (active) {
      if (typeof active.cancel === 'function') {
        active.cancel();
      }
      return { success: true, status: 'cancelling' };
    }

    const run = await this.storage.getRunById(id);
    if (run && !TERMINAL_STATES.has(run.status)) {
      await this._transitionState(id, 'cancelled', {
        finishedAt: new Date().toISOString(),
      });
      return { success: true, status: 'cancelled' };
    }

    return { success: false, reason: 'Run not active or already in terminal state' };
  }

  async _transitionState(id, newStatus, updates = {}) {
    const current = await this.storage.getRunById(id);
    if (!current) return null;

    if (TERMINAL_STATES.has(current.status)) {
      console.warn(`[RunnerManager] Disallowed transition: cannot transition from terminal state '${current.status}' to '${newStatus}' for run ${id}.`);
      return current;
    }

    const updated = await this.storage.updateRun(id, {
      ...updates,
      status: newStatus,
    });

    this.events.emit(`status:${id}`, { id, status: newStatus, ...updates });
    return updated;
  }

  async _processNext() {
    if (this.runningCount >= this.maxActive || this.queue.length === 0) {
      return;
    }

    const runId = this.queue.shift();
    const run = await this.storage.getRunById(runId);
    if (!run || TERMINAL_STATES.has(run.status)) {
      return this._processNext();
    }

    this.runningCount++;
    this._executeRun(run).finally(() => {
      this.runningCount--;
      this._processNext();
    });
  }

  async _executeRun(run) {
    // Transition: queued -> validating
    await this._transitionState(run.id, 'validating');

    // Transition: validating -> running
    await this._transitionState(run.id, 'running', {
      startedAt: new Date().toISOString(),
    });

    const hasK6 = await isK6Available(config.k6Bin);

    if (hasK6 && run.profile !== 'stages') {
      return this._executeWithK6(run);
    } else {
      return this._executeWithNodeWorker(run);
    }
  }

  async _executeWithK6(run) {
    let cancelCallback = null;
    const cancelPromise = new Promise(resolve => {
      cancelCallback = resolve;
    });

    this.activeRuns.set(run.id, {
      type: 'k6',
      cancel: () => cancelCallback && cancelCallback(),
    });

    try {
      const summary = await executeK6Run(
        {
          id: run.id,
          url: run.url,
          method: run.method,
          concurrency: run.concurrency,
          durationSec: run.durationSec,
          bin: config.k6Bin,
        },
        cancelFn => {
          cancelPromise.then(cancelFn);
        }
      );

      await this._transitionState(run.id, summary.status || 'completed', {
        ...summary,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await this._transitionState(run.id, 'failed', {
        error: String(err.message || err).slice(0, 300),
        finishedAt: new Date().toISOString(),
      });
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  async _executeWithNodeWorker(run) {
    return new Promise((resolve) => {
      const child = fork(workerPath, [], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });

      const totalDurationSec = run.profile === 'stages' && Array.isArray(run.stages) && run.stages.length > 0
        ? run.stages.reduce((acc, s) => acc + s.durationSec, 0)
        : run.durationSec;

      // Hard watchdog timer: duration + 8s buffer
      const watchdogTimeout = setTimeout(async () => {
        console.warn(`[RunnerManager] Watchdog timeout triggered for run ${run.id}. Terminating worker.`);
        try { child.kill('SIGKILL'); } catch {}
        await this._transitionState(run.id, 'timed_out', {
          error: 'Execution exceeded allowable maximum run duration watchdog threshold.',
          finishedAt: new Date().toISOString(),
        }).catch(() => {});
      }, (totalDurationSec * 1000) + 8000);

      const cancel = () => {
        try {
          child.send({ type: 'cancel' });
          setTimeout(() => {
            try { child.kill('SIGTERM'); } catch {}
          }, 1000);
        } catch {}
      };

      this.activeRuns.set(run.id, {
        type: 'node-worker',
        child,
        cancel,
        timeoutId: watchdogTimeout,
      });

      child.on('message', async (msg) => {
        if (!msg) return;

        if (msg.type === 'progress' && msg.data) {
          this.events.emit(`progress:${run.id}`, msg.data);
          await this.storage.updateRun(run.id, msg.data).catch(() => {});
        } else if (msg.type === 'complete' && msg.data) {
          clearTimeout(watchdogTimeout);
          this.events.emit(`complete:${run.id}`, msg.data);
          const finalStatus = msg.data.status || 'completed';
          await this._transitionState(run.id, finalStatus, msg.data).catch(() => {});
        } else if (msg.type === 'error') {
          clearTimeout(watchdogTimeout);
          this.events.emit(`error:${run.id}`, msg.error);
          await this._transitionState(run.id, 'failed', {
            error: String(msg.error).slice(0, 300),
            finishedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      });

      child.on('error', async (err) => {
        clearTimeout(watchdogTimeout);
        this.events.emit(`error:${run.id}`, err.message);
        await this._transitionState(run.id, 'failed', {
          error: `Subprocess error: ${err.message}`.slice(0, 300),
          finishedAt: new Date().toISOString(),
        }).catch(() => {});
      });

      child.on('exit', async (code, signal) => {
        clearTimeout(watchdogTimeout);
        this.activeRuns.delete(run.id);

        const currentRun = await this.storage.getRunById(run.id);
        if (currentRun && !TERMINAL_STATES.has(currentRun.status)) {
          const finalStatus = signal === 'SIGTERM' || signal === 'SIGINT'
            ? 'cancelled'
            : code === 0 ? 'completed' : 'failed';
          await this._transitionState(run.id, finalStatus, {
            finishedAt: new Date().toISOString(),
          }).catch(() => {});
        }

        resolve();
      });

      // Send start message via IPC
      child.send({
        type: 'start',
        payload: {
          id: run.id,
          url: run.url,
          method: run.method,
          concurrency: run.concurrency,
          durationSec: run.durationSec,
          profile: run.profile,
          stages: run.stages,
          headers: run.headers,
          body: run.body,
          timeoutMs: run.timeoutMs || config.requestTimeoutMs || 5000,
          allowLocalTargets: config.allowLocalTargets,
        },
      });
    });
  }
}

let runnerInstance = null;

export function getRunnerManager(storage) {
  if (!runnerInstance) {
    runnerInstance = new RunnerManager(storage);
  }
  return runnerInstance;
}
