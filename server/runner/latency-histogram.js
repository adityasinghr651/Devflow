/**
 * High Dynamic Range (HDR) Bounded-Memory Latency Histogram.
 *
 * Provides O(1) constant-time recording and fixed O(1) memory footprint
 * independent of total request count. Quantizes latency samples (0 to 60,000ms)
 * across 5 fine-grained resolution tiers:
 *   Tier 1: [0.00ms, 20.00ms)    -> 0.05ms width (400 buckets)
 *   Tier 2: [20.00ms, 100.00ms)  -> 0.10ms width (800 buckets)
 *   Tier 3: [100.00ms, 1000.0ms) -> 0.50ms width (1,800 buckets)
 *   Tier 4: [1000ms, 10000ms)    -> 5.00ms width (1,800 buckets)
 *   Tier 5: [10000ms, 60000ms]   -> 25.0ms width (2,000 buckets)
 *   Overflow: > 60000ms          -> 1 bucket
 * Total: 6,801 buckets in a Uint32Array (~27.2 KB fixed memory).
 *
 * For sample counts N <= exactCapacity (default 1024, ~8 KB), exact values
 * are stored in a fixed Float64Array for 100% exact Nearest-Rank computation.
 * For N > exactCapacity, percentiles are computed via linear interpolation
 * across histogram buckets.
 * Total memory is strictly capped at ~35 KB regardless of request volume.
 */

export const BUCKET_COUNT = 6801;
export const DEFAULT_EXACT_CAPACITY = 1024;

export class LatencyHistogram {
  constructor(options = {}) {
    this.exactCapacity = options.exactCapacity !== undefined
      ? Math.max(0, Number(options.exactCapacity) || 0)
      : DEFAULT_EXACT_CAPACITY;

    this.buckets = new Uint32Array(BUCKET_COUNT);
    this.exactBuffer = this.exactCapacity > 0 ? new Float64Array(this.exactCapacity) : null;
    this.totalCount = 0;
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.minOverflowLatency = Infinity;
    this.sumLatency = 0;
  }

  /**
   * Maps a latency value in milliseconds to a bucket index in O(1) time.
   */
  _getBucketIndex(x) {
    if (x < 20) {
      return Math.floor(x * 20); // x / 0.05
    }
    if (x < 100) {
      return 400 + Math.floor((x - 20) * 10); // (x - 20) / 0.1
    }
    if (x < 1000) {
      return 1200 + Math.floor((x - 100) * 2); // (x - 100) / 0.5
    }
    if (x < 10000) {
      return 3000 + Math.floor((x - 1000) / 5); // (x - 1000) / 5
    }
    if (x <= 60000) {
      return Math.min(6799, 4800 + Math.floor((x - 10000) / 25)); // (x - 10000) / 25 capped at tier 5 max bucket
    }
    return 6800; // overflow bucket (> 60000ms)
  }

  /**
   * Returns [min, max] bounds for a bucket index in milliseconds.
   */
  _getBucketRange(index) {
    if (index < 400) {
      const min = index * 0.05;
      return [min, min + 0.05];
    }
    if (index < 1200) {
      const min = 20 + (index - 400) * 0.1;
      return [min, min + 0.1];
    }
    if (index < 3000) {
      const min = 100 + (index - 1200) * 0.5;
      return [min, min + 0.5];
    }
    if (index < 4800) {
      const min = 1000 + (index - 3000) * 5;
      return [min, min + 5];
    }
    if (index < 6800) {
      const min = 10000 + (index - 4800) * 25;
      return [min, min + 25];
    }
    const min = Number.isFinite(this.minOverflowLatency) ? this.minOverflowLatency : 60000;
    const max = Math.max(min, this.maxLatency);
    return [min, max];
  }

  /**
   * Records a single latency sample in O(1) constant time without dynamic memory allocation.
   */
  record(latencyMs) {
    const val = Math.max(0, Number(latencyMs) || 0);
    const bucketIdx = this._getBucketIndex(val);
    this.buckets[bucketIdx]++;

    if (this.exactBuffer && this.totalCount < this.exactCapacity) {
      this.exactBuffer[this.totalCount] = val;
    }

    if (val < this.minLatency) this.minLatency = val;
    if (val > this.maxLatency) this.maxLatency = val;
    if (val > 60000 && val < this.minOverflowLatency) {
      this.minOverflowLatency = val;
    }
    this.sumLatency += val;
    this.totalCount++;
  }

  /**
   * Computes the given percentile (e.g., 0.50, 0.95, 0.99) rounded to 2 decimal places.
   * Guaranteed monotonic: p1 <= p2 implies getPercentile(p1) <= getPercentile(p2).
   */
  getPercentile(percentile) {
    if (this.totalCount === 0) return 0;
    const p = Math.max(0.0001, Math.min(1, Number(percentile) || 0));

    // For small sample sizes within exact capacity, compute exact Nearest Rank
    if (this.exactBuffer && this.totalCount <= this.exactCapacity) {
      const slice = Array.from(this.exactBuffer.subarray(0, this.totalCount)).sort((a, b) => a - b);
      const index = Math.min(slice.length - 1, Math.max(0, Math.ceil(p * slice.length) - 1));
      return Number(slice[index].toFixed(2));
    }

    return this.getPercentileFromBuckets(p);
  }

  /**
   * Computes the percentile directly from histogram buckets via linear rank interpolation.
   */
  getPercentileFromBuckets(percentile) {
    if (this.totalCount === 0) return 0;
    const p = Math.max(0.0001, Math.min(1, Number(percentile) || 0));
    const targetRank = Math.max(1, Math.min(this.totalCount, Math.ceil(p * this.totalCount)));
    let accum = 0;

    for (let i = 0; i < this.buckets.length; i++) {
      const count = this.buckets[i];
      if (count === 0) continue;
      accum += count;

      if (accum >= targetRank) {
        const prevAccum = accum - count;
        const rankInBucket = targetRank - prevAccum;
        const [bMin, bMax] = this._getBucketRange(i);

        // Linear midpoint interpolation within the bucket
        const fraction = count > 0 ? (rankInBucket - 0.5) / count : 0.5;
        let estimated = bMin + fraction * (bMax - bMin);

        // Clamp to observed min/max
        estimated = Math.max(this.minLatency, Math.min(this.maxLatency, estimated));
        return Number(estimated.toFixed(2));
      }
    }

    return Number(this.maxLatency.toFixed(2));
  }

  /**
   * Returns a complete statistical summary object.
   */
  getSummary() {
    return {
      count: this.totalCount,
      min: this.totalCount ? Number(this.minLatency.toFixed(2)) : 0,
      max: this.totalCount ? Number(this.maxLatency.toFixed(2)) : 0,
      mean: this.totalCount ? Number((this.sumLatency / this.totalCount).toFixed(2)) : 0,
      p50: this.getPercentile(0.50),
      p95: this.getPercentile(0.95),
      p99: this.getPercentile(0.99),
    };
  }

  /**
   * Returns bucket counts and percentages across the 5 resolution tiers plus overflow.
   */
  getTierSummary() {
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let tier4Count = 0;
    let tier5Count = 0;
    let overflowCount = this.buckets[6800] || 0;

    for (let i = 0; i < 400; i++) tier1Count += this.buckets[i];
    for (let i = 400; i < 1200; i++) tier2Count += this.buckets[i];
    for (let i = 1200; i < 3000; i++) tier3Count += this.buckets[i];
    for (let i = 3000; i < 4800; i++) tier4Count += this.buckets[i];
    for (let i = 4800; i < 6800; i++) tier5Count += this.buckets[i];

    const total = this.totalCount || 1;
    return {
      tier1Count,
      tier2Count,
      tier3Count,
      tier4Count,
      tier5Count,
      overflowCount,
      tier1Pct: Number(((tier1Count / total) * 100).toFixed(1)),
      tier2Pct: Number(((tier2Count / total) * 100).toFixed(1)),
      tier3Pct: Number(((tier3Count / total) * 100).toFixed(1)),
      tier4Pct: Number(((tier4Count / total) * 100).toFixed(1)),
      tier5Pct: Number(((tier5Count / total) * 100).toFixed(1)),
      overflowPct: Number(((overflowCount / total) * 100).toFixed(1)),
    };
  }

  /**
   * Resets all bucket counters and buffers for reuse.
   */
  reset() {
    this.buckets.fill(0);
    if (this.exactCapacity > 0 && !this.exactBuffer) {
      this.exactBuffer = new Float64Array(this.exactCapacity);
    } else if (this.exactBuffer) {
      this.exactBuffer.fill(0);
    }
    this.totalCount = 0;
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.minOverflowLatency = Infinity;
    this.sumLatency = 0;
  }

  /**
   * Merges another compatible LatencyHistogram or supported serialized representation additively.
   *
   * @param {LatencyHistogram|object} other - Histogram instance or serialized histogram object.
   * @returns {LatencyHistogram} this instance for method chaining.
   * @throws {TypeError|Error} if other is null, undefined, or structurally incompatible.
   */
  merge(other) {
    if (!other || typeof other !== 'object') {
      throw new TypeError('Invalid input: expected a LatencyHistogram instance or compatible serialized object.');
    }

    const otherBuckets = other.buckets;
    if (!otherBuckets || (!Array.isArray(otherBuckets) && !ArrayBuffer.isView(otherBuckets))) {
      throw new Error('Incompatible histogram: missing or invalid buckets array.');
    }

    if (otherBuckets.length !== BUCKET_COUNT) {
      throw new Error(`Incompatible histogram: expected ${BUCKET_COUNT} buckets, got ${otherBuckets.length}.`);
    }

    if (other.bucketCount !== undefined && other.bucketCount !== BUCKET_COUNT) {
      throw new Error(`Incompatible histogram bucketCount: expected ${BUCKET_COUNT}, got ${other.bucketCount}.`);
    }

    const otherCount = other.totalCount;
    if (typeof otherCount !== 'number' || Number.isNaN(otherCount) || otherCount < 0) {
      throw new Error('Incompatible histogram: totalCount must be a non-negative number.');
    }

    const otherSum = other.sumLatency !== undefined ? other.sumLatency : 0;
    if (typeof otherSum !== 'number' || Number.isNaN(otherSum) || otherSum < 0) {
      throw new Error('Incompatible histogram: sumLatency must be a non-negative number.');
    }

    if (other.minLatency !== undefined && other.minLatency !== null) {
      if (typeof other.minLatency !== 'number' || Number.isNaN(other.minLatency)) {
        throw new Error('Incompatible histogram: minLatency must be a valid number.');
      }
    }

    if (other.maxLatency !== undefined && other.maxLatency !== null) {
      if (typeof other.maxLatency !== 'number' || Number.isNaN(other.maxLatency) || other.maxLatency < 0) {
        throw new Error('Incompatible histogram: maxLatency must be a non-negative number.');
      }
    }

    // Merging an empty histogram is a safe no-op
    if (otherCount === 0) {
      return this;
    }

    const prevCount = this.totalCount;
    const newTotal = prevCount + otherCount;

    // Merge buckets additively
    for (let i = 0; i < BUCKET_COUNT; i++) {
      this.buckets[i] += otherBuckets[i];
    }

    // Exact sample preservation for hybrid Nearest-Rank mode
    const thisHasExact = this.exactBuffer !== null && prevCount <= this.exactCapacity;
    let otherExact = null;
    if (other.exactBuffer && otherCount <= (other.exactCapacity !== undefined ? other.exactCapacity : this.exactCapacity)) {
      otherExact = other.exactBuffer.subarray(0, otherCount);
    } else if (Array.isArray(other.exactSamples) && other.exactSamples.length === otherCount) {
      otherExact = other.exactSamples;
    } else if (ArrayBuffer.isView(other.exactSamples) && other.exactSamples.length === otherCount) {
      otherExact = other.exactSamples;
    }

    const canPreserveExact = thisHasExact && (otherExact !== null || otherCount === 0) && (newTotal <= this.exactCapacity);

    if (canPreserveExact && otherExact && otherCount > 0) {
      this.exactBuffer.set(otherExact, prevCount);
    } else if (!canPreserveExact && this.exactBuffer && newTotal <= this.exactCapacity) {
      // If exact samples cannot be fully combined for a small count, nullify exactBuffer
      // so getPercentile falls back to linear interpolation across merged buckets.
      this.exactBuffer = null;
    }

    // Combine summary statistics
    const otherMin = other.minLatency !== undefined && other.minLatency !== null && Number.isFinite(other.minLatency)
      ? other.minLatency
      : Infinity;
    const otherMax = other.maxLatency !== undefined && other.maxLatency !== null
      ? other.maxLatency
      : 0;
    const otherMinOverflow = other.minOverflowLatency !== undefined && other.minOverflowLatency !== null && Number.isFinite(other.minOverflowLatency)
      ? other.minOverflowLatency
      : Infinity;

    if (prevCount === 0) {
      this.minLatency = otherMin;
      this.maxLatency = otherMax;
      this.minOverflowLatency = otherMinOverflow;
      this.sumLatency = otherSum;
      this.totalCount = otherCount;
    } else {
      this.minLatency = Math.min(this.minLatency, otherMin);
      this.maxLatency = Math.max(this.maxLatency, otherMax);
      this.minOverflowLatency = Math.min(this.minOverflowLatency, otherMinOverflow);
      this.sumLatency += otherSum;
      this.totalCount = newTotal;
    }

    return this;
  }

  /**
   * Serializes the histogram into a plain JSON-compatible object.
   * Suitable for IPC transmission across child processes or networks.
   */
  toJSON() {
    return {
      bucketCount: BUCKET_COUNT,
      buckets: Array.from(this.buckets),
      totalCount: this.totalCount,
      minLatency: Number.isFinite(this.minLatency) ? this.minLatency : null,
      maxLatency: this.maxLatency,
      minOverflowLatency: Number.isFinite(this.minOverflowLatency) ? this.minOverflowLatency : null,
      sumLatency: this.sumLatency,
      exactSamples: this.exactBuffer && this.totalCount <= this.exactCapacity
        ? Array.from(this.exactBuffer.subarray(0, this.totalCount))
        : null,
    };
  }

  /**
   * Serializes the histogram into an object preserving typed arrays for zero-copy
   * or fast in-process transfer.
   */
  serialize() {
    return {
      bucketCount: BUCKET_COUNT,
      buckets: new Uint32Array(this.buckets),
      totalCount: this.totalCount,
      minLatency: this.minLatency,
      maxLatency: this.maxLatency,
      minOverflowLatency: this.minOverflowLatency,
      sumLatency: this.sumLatency,
      exactSamples: this.exactBuffer && this.totalCount <= this.exactCapacity
        ? new Float64Array(this.exactBuffer.subarray(0, this.totalCount))
        : null,
    };
  }

  /**
   * Static helper to construct a new LatencyHistogram from serialized data.
   */
  static fromJSON(data, options = {}) {
    const h = new LatencyHistogram(options);
    h.merge(data);
    return h;
  }
}

/**
 * Standard Nearest-Rank percentile calculation for sorted arrays (backward compatibility).
 */
export function calculatePercentile(sortedValues, percentile) {
  if (!sortedValues || !sortedValues.length) return 0;
  const p = Math.max(0.0001, Math.min(1, Number(percentile) || 0));
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(p * sortedValues.length) - 1)
  );
  return Number(sortedValues[index].toFixed(2));
}

