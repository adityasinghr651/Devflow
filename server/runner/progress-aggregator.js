/**
 * Progress Aggregator for distributed multi-worker load test runs.
 *
 * Workers report progress via cumulative snapshot messages asynchronously.
 * This class maintains a per-worker state map of the latest snapshots and
 * derives unified cluster metrics, avoiding double-counting repeated snapshots.
 */
export class ProgressAggregator {
  constructor(workerCount = 1, totalDurationSec = 1) {
    this.workerCount = Math.max(1, workerCount);
    this.totalDurationSec = Math.max(0.1, Number(totalDurationSec) || 1);
    this.workerSnapshots = new Map(); // workerIndex -> latest snapshot
    this.startTime = Date.now();
  }

  /**
   * Updates the latest progress snapshot for a specific worker.
   *
   * @param {number} workerIndex - The 0-based worker index.
   * @param {object} snapshot - The progress data received from the worker.
   * @returns {object} The derived aggregate progress metrics.
   */
  updateWorker(workerIndex, snapshot) {
    if (snapshot && typeof snapshot === 'object') {
      this.workerSnapshots.set(workerIndex, { ...snapshot });
    }
    return this.getAggregatedProgress();
  }

  /**
   * Derives unified aggregate progress metrics across all workers.
   *
   * @returns {object} Unified metrics compatible with the existing SSE event format.
   */
  getAggregatedProgress() {
    let totalRequests = 0;
    let successCount = 0;
    let failedCount = 0;
    let currentConcurrency = 0;
    const statusCodes = {};
    let maxElapsedSec = 0;
    let maxProgressPercent = 0;
    let currentStageIndex = null;

    for (const snap of this.workerSnapshots.values()) {
      if (!snap) continue;

      totalRequests += Number(snap.totalRequests) || 0;
      successCount += Number(snap.successCount) || 0;
      failedCount += Number(snap.failedCount) || 0;
      currentConcurrency += Number(snap.currentConcurrency) || 0;

      if (snap.statusCodes && typeof snap.statusCodes === 'object') {
        for (const [code, count] of Object.entries(snap.statusCodes)) {
          statusCodes[code] = (statusCodes[code] || 0) + Number(count || 0);
        }
      }

      const snapElapsed = Number(snap.elapsedSec) || 0;
      if (snapElapsed > maxElapsedSec) {
        maxElapsedSec = snapElapsed;
      }

      const snapProgress = Number(snap.progressPercent) || 0;
      if (snapProgress > maxProgressPercent) {
        maxProgressPercent = snapProgress;
      }

      if (snap.currentStageIndex !== null && snap.currentStageIndex !== undefined) {
        currentStageIndex = snap.currentStageIndex;
      }
    }

    const wallElapsedSec = Math.max((Date.now() - this.startTime) / 1000, 0.001);
    const elapsedSec = maxElapsedSec > 0 ? maxElapsedSec : Number(wallElapsedSec.toFixed(1));
    const rps = Number((totalRequests / Math.max(elapsedSec, 0.001)).toFixed(2));
    const errorRate = totalRequests ? Number(((failedCount / totalRequests) * 100).toFixed(2)) : 0;
    const progressPercent = Math.min(
      100,
      Math.max(maxProgressPercent, Number(((elapsedSec / this.totalDurationSec) * 100).toFixed(1)))
    );

    return {
      totalRequests,
      successCount,
      failedCount,
      rps,
      errorRate,
      statusCodes,
      currentConcurrency,
      currentStageIndex,
      elapsedSec: Number(elapsedSec.toFixed(1)),
      progressPercent,
    };
  }

  /**
   * Resets the aggregator state.
   */
  reset() {
    this.workerSnapshots.clear();
    this.startTime = Date.now();
  }
}

