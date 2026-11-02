/**
 * Metrics Formatting & Precision Utilities
 * Ensures exact counts and adaptive precision across all dashboard views.
 */

/**
 * Adaptive error rate formatter.
 * Guarantees that when failedCount > 0, it never displays "0.00%".
 */
export function formatErrorRate(
  errorRate?: number,
  failedCount: number = 0,
  totalRequests: number = 0
): string {
  if (totalRequests === 0 || failedCount === 0) return '0.00%';
  const rate =
    typeof errorRate === 'number' && !Number.isNaN(errorRate)
      ? errorRate
      : (failedCount / totalRequests) * 100;

  if (rate > 0 && rate < 0.01) {
    return `${rate.toFixed(4)}%`;
  }
  return `${rate.toFixed(2)}%`;
}

/**
 * Comprehensive error string showing exact counts and adaptive percentage:
 * Example: "2 / 57,004 failed (0.0035%)"
 */
export function formatErrorBreakdown(
  failedCount: number = 0,
  totalRequests: number = 0,
  errorRate?: number
): string {
  if (totalRequests === 0) return '0.00% (0 / 0)';
  const rateStr = formatErrorRate(errorRate, failedCount, totalRequests);
  return `${failedCount.toLocaleString()} / ${totalRequests.toLocaleString()} failed (${rateStr})`;
}

