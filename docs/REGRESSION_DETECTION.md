# Statistical regression detection

DevFlow compares a completed run with the five most recent completed runs that share its target and workload fingerprint (`historySize: 5`). Fewer than three matching baselines returns `insufficient_data`; no verdict is inferred from one or two runs. Demo, partial-worker, and incomplete-histogram records are excluded. Missing metric values are kept as unavailable (`null`) and also produce `insufficient_data`, never a synthetic zero.

## Fingerprint and baseline

The fingerprint contains target ID, HTTP method, normalized path and query, concurrency, duration, profile and stages, runner engine, worker count, and assertions. Query order is normalized; query values remain part of the fingerprint because they can change target behavior. Only runs owned by the authenticated user are considered.

For RPS, p95, p99, and error rate, DevFlow calculates the baseline median and median absolute deviation (MAD). The scaled MAD is `1.4826 × MAD`; the statistical band is three scaled MADs from the median. A regression requires both a directional statistical-band violation and the metric's minimum change. Improvements use the corresponding opposite direction.

| Metric | Direction of regression | Minimum change |
|---|---|---:|
| RPS | Below baseline | 3.22% (3 × Phase 1 one-worker RPS CV of 1.0726%) |
| p95 | Above baseline | 19.36% (3 × Phase 1 one-worker p95 CV of 6.4521%) |
| p99 | Above baseline | 19.36%, using p95 variance as the closest Phase 1 tail-latency measurement |
| Error rate | Above baseline | 25% relative plus a 0.01 percentage-point floor; Phase 1's controlled samples had no failures, so they cannot estimate error-rate variance |

The final decision threshold is the larger of the three-scaled-MAD band, the metric minimum change, and the error-rate floor where applicable. For zero baseline error rate, an increase must exceed 0.01 percentage points to count as a regression. The API returns `baselineCount`, `historySize`, `minimumBaselineRuns`, exact baseline run IDs, observed metric, median, MAD, decision band, and minimum change used. CLI output and the GitHub PR comment state the used/available baseline window and show each metric's decision band. Insufficient history is named explicitly.

## Use it

`GET /api/v1/runs/{id}/regression` returns the verdict. The CLI includes the verdict and bands in JSON and readable output; exit code 1 marks a regression or request/assertion failure. The GitHub Action puts the verdict, observed values, bands, and exact request counts in its single maintained PR comment. The existing fixed-percentage benchmark workflow remains available.

## Limits

Results depend on recent comparable history and local host noise. Different fingerprints and missing history are reported as insufficient rather than compared. Baseline history is scoped to one DevFlow owner and target. This feature was evaluated using a local controlled HTTP target on one host; it does not establish false-positive or detection rates across teams, machines, cloud runners, or production workloads. Use stable targets and repeat an unexpected result before acting on it.

The earlier local experiment's raw run data remains under `benchmarks/results/regression-experiment-*.json`. The Phase 2 CLI-driven controlled studies are saved in `benchmarks/results/false-positive-study.md`, `benchmarks/results/true-positive-study.md`, and `benchmarks/results/regression-study-raw.json` after `npm run regression:study`.
