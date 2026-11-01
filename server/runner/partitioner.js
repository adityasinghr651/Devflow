/**
 * Pure workload partitioning module for distributed load testing.
 * Splits fixed and staged virtual user (VU) concurrency across N worker processes
 * with exact integer remainder distribution, ensuring the sum of worker concurrency
 * strictly equals the configured concurrency at all times.
 */

/**
 * Distributes an integer total across a given count of workers with remainder distribution.
 *
 * @param {number} total - Total value to distribute (e.g. concurrency or stage target).
 * @param {number} count - Number of worker partitions.
 * @returns {number[]} Array of partitioned integers whose sum strictly equals total.
 */
export function partitionInteger(total, count) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));

  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal % safeCount;

  const result = new Array(safeCount);
  for (let i = 0; i < safeCount; i++) {
    result[i] = i < remainder ? base + 1 : base;
  }
  return result;
}

/**
 * Partitions a run workload configuration across workerCount worker slices.
 *
 * @param {object} runConfig - The run configuration object.
 * @param {number} workerCount - Configured number of workers (e.g. 1, 2, or 4).
 * @returns {object[]} Array of worker slice configurations.
 */
export function partitionWorkload(runConfig, workerCount = 1) {
  if (!runConfig || typeof runConfig !== 'object') {
    throw new TypeError('Invalid run configuration: expected an object.');
  }

  // Normalize worker count: integer >= 1
  const count = Number.isInteger(workerCount) && workerCount >= 1 ? workerCount : 1;

  const baseConcurrency = Number(runConfig.concurrency) || 1;
  const concurrencySlices = partitionInteger(baseConcurrency, count);

  const isStages = runConfig.profile === 'stages' && Array.isArray(runConfig.stages) && runConfig.stages.length > 0;

  let stageSlicesPerWorker = null;
  if (isStages) {
    stageSlicesPerWorker = Array.from({ length: count }, () => []);

    for (let sIdx = 0; sIdx < runConfig.stages.length; sIdx++) {
      const stage = runConfig.stages[sIdx];
      const targetSlices = partitionInteger(stage.target, count);

      for (let wIdx = 0; wIdx < count; wIdx++) {
        stageSlicesPerWorker[wIdx].push({
          durationSec: stage.durationSec,
          target: targetSlices[wIdx],
        });
      }
    }
  }

  return concurrencySlices.map((sliceConcurrency, workerIndex) => {
    const workerStages = isStages ? stageSlicesPerWorker[workerIndex] : (runConfig.stages || []);
    return {
      ...runConfig,
      workerIndex,
      workerCount: count,
      concurrency: sliceConcurrency,
      stages: workerStages,
      isSlice: true,
    };
  });
}

