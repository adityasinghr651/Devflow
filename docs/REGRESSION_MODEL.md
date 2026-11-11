# DevFlow regression model

This page describes the implementation in `server/runner/regression.js` and the user-visible result returned by `GET /api/v1/runs/{id}/regression`, the CLI, and the GitHub Action.

## Comparable runs

The fingerprint includes target ID, normalized HTTP method and path/query, concurrency, duration, profile and stages, engine, worker count, and assertions. Query parameter order is normalized; query values remain significant. The API evaluates only the authenticated owner's history. A baseline candidate must have the same target and fingerprint and be a completed, non-demo run with no partial workers and a complete histogram.

The detector uses the five most recent qualifying runs (`historySize = 5`) and needs at least three (`minimumBaselineRuns = 3`). It reports the exact baseline run IDs, current count, history window, and minimum. With fewer than three matching runs, an incomplete run, or a missing metric value, the verdict is `insufficient_data`; unavailable values stay `null` rather than becoming zero.

## Statistics and decisions

For RPS, p95, p99, and error rate, the model calculates the baseline median and median absolute deviation (MAD). It scales MAD by 1.4826, then uses three scaled MADs as the robust statistical band. The applied threshold is the largest of that band, the per-metric minimum change, and the error-rate absolute floor.

| Metric | Regression direction | Minimum change |
|---|---|---:|
| RPS | Below baseline | 3.2178% |
| p95 | Above baseline | 19.3563% |
| p99 | Above baseline | 19.3563% (uses p95's nearest repeated tail-latency variance estimate) |
| Error rate | Above baseline | 25% relative and 0.01 percentage points absolute |

The relative minima are three times the measured one-worker Phase 1 coefficients of variation: 1.0726% for RPS and 6.4521% for p95. The Phase 1 controlled workload had no errors, so its error-rate variance was not estimable. These policy values are not accuracy guarantees. The true-positive and false-positive studies below are single-host observations, not population rates.

The metric verdicts are `pass`, `regression`, `improvement`, or `insufficient_data`. Overall verdict precedence is: any insufficient metric makes the overall result `insufficient_data`; otherwise any regression wins; otherwise any improvement wins; otherwise the result is `pass`.

## Output and interpretation

Each metric result reports observed value, baseline median, MAD, scaled MAD, statistical band, applied threshold, decision band, and baseline values. The API includes baseline IDs and window counts. Readable CLI and Action summaries show how many of the most recent comparable runs were used, the minimum required count, and the per-metric decision band. No confidence percentage is claimed.

## Validation scope

The observed Phase 2 study produced 0 false regressions in 17 eligible stable comparisons. It detected +25% and +50% added latency in 5/5 independent trials each, and detected +10% latency in 0/5 trials. The +10% misses are consistent with the current p95 minimum change threshold (19.3563%); lowering that threshold is not justified by only 17 stable comparisons. Keep this sensitivity limit visible and collect more representative CI data before retuning. These rates are small local study counts, not accuracy guarantees.

Accuracy claims must be based on the raw Phase 2 studies at `benchmarks/results/false-positive-study.md` and `benchmarks/results/true-positive-study.md`, including their run-level JSON data. Results apply only to the recorded Windows machine, controlled loopback target, and workload. They do not establish behavior across other hardware, hosted CI, real applications, or teams.
