import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getStorage } from '../storage/index.js';
import { isK6Available, executeK6Run } from './k6-adapter.js';
import { TestCoordinator } from './coordinator.js';
import { getEnvironmentMetadata } from '../environment.js';

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
    this.executionInputs = new Map();
    this.executionPromises = new Set();
    this.events = new EventEmitter();
    this.events.setMaxListeners(200);
  }

  async startupRecovery() {
    const cleaned = await this.storage.cleanupStaleRuns();
    if (cleaned > 0) {
      console.log(`[RunnerManager] Startup recovery: cleaned up ${cleaned} stale active runs.`);
    }
  }

  async shutdown(timeoutMs = 8000) {
    for (const runId of [...this.queue]) await this.cancelRun(runId);
    for (const [runId, active] of this.activeRuns) {
      if (active.type === 'starting' || active.type === 'k6' || active.type === 'coordinator') {
        const run = await this.storage.getRunById(runId);
        if (!run || TERMINAL_STATES.has(run.status)) continue;
        await this._transitionState(runId, 'cancelling');
        active.cancel?.();
      }
    }
    const pending = Promise.allSettled([...this.executionPromises]);
    let timer;
    const timedOut = await Promise.race([
      pending.then(() => false),
      new Promise(resolve => { timer = setTimeout(() => resolve(true), timeoutMs); }),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      for (const active of this.activeRuns.values()) {
        if (active.coordinator) active.coordinator._terminateAllWorkers('SIGKILL');
        active.cancel?.();
      }
      await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    return { timedOut };
  }

  getEngineName() {
    return this.useK6 ? 'k6-subprocess' : 'node-subprocess-worker';
  }

  async enqueueRun(run) {
    if (this.dispatchedRuns.has(run.id)) {
      console.warn(`[RunnerManager] Run ${run.id} is already dispatched. Ignoring duplicate enqueue.`);
      return run;
    }
    this.executionInputs.set(run.id, { headers: run.headers || {} });
    this.dispatchedRuns.add(run.id);
    this.queue.push(run.id);
    void this._processNext();
    return run;
  }

  async cancelRun(id) {
    const current = await this.storage.getRunById(id);
    if (current && TERMINAL_STATES.has(current.status)) {
      return { success: false, reason: 'Run not active or already in terminal state' };
    }

    const qIdx = this.queue.indexOf(id);
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1);
      this.executionInputs.delete(id);
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

  async _transitionState(id, newStatus, updates = {}, emitStatus = true) {
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

    if (TERMINAL_STATES.has(newStatus) && !TERMINAL_STATES.has(current.status)) {
      await this.storage.createAuditEvent?.({
        userId: current.userId,
        action: 'RUN_FINISH',
        resourceType: 'run',
        resourceId: id,
        details: { status: newStatus },
      })?.catch(() => {});
    }

    if (emitStatus) this.events.emit(`status:${id}`, { id, status: newStatus, ...updates });
    return updated;
  }

  async _processNext() {
    if (this.runningCount >= this.maxActive || this.queue.length === 0) {
      return;
    }

    const runId = this.queue.shift();
    let run;
    try {
      run = await this.storage.getRunById(runId);
    } catch (err) {
      const message = String(err?.message || err || 'Runner failed before execution started').slice(0, 300);
      console.error(`[RunnerManager] Failed to dispatch run ${runId}: ${message}`);
      try {
        await this._transitionState(runId, 'failed', {
          error: `Could not start test execution: ${message}`,
          finishedAt: new Date().toISOString(),
        });
      } catch (persistError) {
        console.error(`[RunnerManager] Could not persist failed status for run ${runId}: ${persistError.message}`);
      }
      void this._processNext();
      return;
    }
    if (!run || TERMINAL_STATES.has(run.status)) {
      this.executionInputs.delete(runId);
      return this._processNext();
    }

    const executionInput = this.executionInputs.get(runId);
    this.executionInputs.delete(runId);
    const executionRun = executionInput ? { ...run, ...executionInput } : run;

    this.runningCount++;
    const execution = this._executeRun(executionRun);
    this.executionPromises.add(execution);
    void execution.catch(async err => {
      const message = String(err?.message || err || 'Runner execution failed').slice(0, 300);
      console.error(`[RunnerManager] Run ${runId} failed unexpectedly: ${message}`);
      try {
        await this._transitionState(runId, 'failed', { error: message, finishedAt: new Date().toISOString() });
      } catch (persistError) {
        console.error(`[RunnerManager] Could not persist failed status for run ${runId}: ${persistError.message}`);
      }
    }).finally(() => {
      this.executionPromises.delete(execution);
      this.runningCount--;
      void this._processNext();
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
      const hasAssertions = run.assertions && Object.keys(run.assertions).length > 0;
      const canUseK6 = !hasAssertions && enginePref !== 'node' && (enginePref === 'k6' || (await isK6Available(config.k6Bin)));

      const engine = canUseK6 && run.profile !== 'stages' && (!run.workerCount || run.workerCount === 1)
        ? 'k6' : 'node';
      await this.storage.updateRun(run.id, {
        engine,
        workerCount: run.workerCount || 1,
        environmentMetadata: getEnvironmentMetadata(engine, run.workerCount || 1),
      });

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
      transitionState: (id, status, updates) => this._transitionState(id, status, { engine: 'node', ...updates }, false),
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
