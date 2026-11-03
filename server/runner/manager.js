import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getStorage } from '../storage/index.js';
import { isK6Available, executeK6Run } from './k6-adapter.js';
import { TestCoordinator } from './coordinator.js';

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
      if (active.type === 'starting') {
        if (typeof active.cancel === 'function') {
          active.cancel();
        }
        await this._transitionState(id, 'cancelled', {
          finishedAt: new Date().toISOString(),
        });
        return { success: true, status: 'cancelled' };
      }
      await this._transitionState(id, 'cancelling');
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

    if (current.status === 'cancelling' && !['cancelled', 'failed', 'timed_out'].includes(newStatus)) {
      console.warn(`[RunnerManager] Disallowed transition: cannot transition from 'cancelling' to '${newStatus}' for run ${id}.`);
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
    // If run was already cancelled or is in terminal state, do not execute
    const initial = await this.storage.getRunById(run.id);
    if (!initial || TERMINAL_STATES.has(initial.status) || initial.status === 'cancelling') {
      return;
    }

    // Register active run entry early so cancelRun can hook into it
    let cancelDelegate = null;
    let isEarlyCancelled = false;

    this.activeRuns.set(run.id, {
      type: 'starting',
      cancel: () => {
        isEarlyCancelled = true;
        if (cancelDelegate) {
          cancelDelegate();
        }
      },
    });

    try {
      const beforeVal = await this.storage.getRunById(run.id);
      if (!beforeVal || TERMINAL_STATES.has(beforeVal.status) || beforeVal.status === 'cancelling' || isEarlyCancelled) {
        if (beforeVal && (beforeVal.status === 'cancelling' || isEarlyCancelled) && !TERMINAL_STATES.has(beforeVal.status)) {
          await this._transitionState(run.id, 'cancelled', { finishedAt: new Date().toISOString() });
        }
        return;
      }

      // Transition: queued -> validating
      const valState = await this._transitionState(run.id, 'validating');
      if (!valState || TERMINAL_STATES.has(valState.status) || valState.status === 'cancelling' || isEarlyCancelled) {
        if (valState && (valState.status === 'cancelling' || isEarlyCancelled) && !TERMINAL_STATES.has(valState.status)) {
          await this._transitionState(run.id, 'cancelled', {
            finishedAt: new Date().toISOString(),
          });
        }
        return;
      }

      const beforeRun = await this.storage.getRunById(run.id);
      if (!beforeRun || TERMINAL_STATES.has(beforeRun.status) || beforeRun.status === 'cancelling' || isEarlyCancelled) {
        if (beforeRun && (beforeRun.status === 'cancelling' || isEarlyCancelled) && !TERMINAL_STATES.has(beforeRun.status)) {
          await this._transitionState(run.id, 'cancelled', { finishedAt: new Date().toISOString() });
        }
        return;
      }

      // Transition: validating -> running
      const runState = await this._transitionState(run.id, 'running', {
        startedAt: new Date().toISOString(),
      });
      if (!runState || TERMINAL_STATES.has(runState.status) || runState.status === 'cancelling' || isEarlyCancelled) {
        if (runState && (runState.status === 'cancelling' || isEarlyCancelled) && !TERMINAL_STATES.has(runState.status)) {
          await this._transitionState(run.id, 'cancelled', {
            finishedAt: new Date().toISOString(),
          });
        }
        return;
      }

      const enginePref = (process.env.RUNNER_ENGINE || config.runnerEngine || 'auto').toLowerCase();
      const canUseK6 = enginePref !== 'node' && (enginePref === 'k6' || (await isK6Available(config.k6Bin)));

      if (canUseK6 && run.profile !== 'stages' && (!run.workerCount || run.workerCount === 1)) {
        return await this._executeWithK6(run, fn => { cancelDelegate = fn; });
      } else {
        return await this._executeWithCoordinator(run, fn => { cancelDelegate = fn; });
      }
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  async _executeWithK6(run, registerCancelFn) {
    let cancelCallback = null;
    const cancelPromise = new Promise(resolve => {
      cancelCallback = resolve;
    });

    const activeEntry = this.activeRuns.get(run.id);
    if (activeEntry) {
      activeEntry.type = 'k6';
    }
    if (registerCancelFn) {
      registerCancelFn(() => cancelCallback && cancelCallback());
    }

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
        engine: 'k6',
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await this._transitionState(run.id, 'failed', {
        error: String(err.message || err).slice(0, 300),
        engine: 'k6',
        finishedAt: new Date().toISOString(),
      });
    }
  }

  async _executeWithCoordinator(run, registerCancelFn) {
    const coordinator = new TestCoordinator(run, {
      storage: this.storage,
      events: this.events,
      workerPath,
      transitionState: (id, status, updates) => this._transitionState(id, status, { engine: 'node', ...updates }),
    });

    const activeEntry = this.activeRuns.get(run.id);
    if (activeEntry) {
      activeEntry.type = 'coordinator';
      activeEntry.coordinator = coordinator;
    }
    if (registerCancelFn) {
      registerCancelFn(() => coordinator.cancel());
    }

    await coordinator.start();
  }
}

let runnerInstance = null;

export function getRunnerManager(storage) {
  if (!runnerInstance) {
    runnerInstance = new RunnerManager(storage);
  }
  return runnerInstance;
}
