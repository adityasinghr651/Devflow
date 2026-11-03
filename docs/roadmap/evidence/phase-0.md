# Phase 0 Evidence — Correctness

Run date: 2026-11-03 (UTC)  
Branch: `roadmap/phase-0-correctness`  
Starting commit: `f95189ab88710631c6895232f7ee4f7038353c33`  
Node: `v22.14.0`  
OS: `Microsoft Windows 10.0.26300`  
CPU: `AMD Ryzen 5 5600H with Radeon Graphics`, 12 logical cores  
Memory reported by Node: 7.3 GB

The original `main` checkout was `## main...origin/main` with untracked `DEVFLOW_ROADMAP_RUNBOOK.md` and `demo/`. Those files were preserved; Phase 0 ran in the isolated worktree created from the configured `phase-7-distributed-runner` base.

## Reproduction and fix evidence

At the starting commit, the new test files were copied into a temporary detached worktree and run against the unmodified implementation:

```text
ProgressAggregator: RPS uses first request start through last completion across workers
not ok — Expected values to be strictly equal: undefined !== 4

Metrics Scenario 1
not ok — Measurement window must span the first request start through last completion

Metrics Scenario 9
not ok — redirectBlockedCount must record redirect blocks

Metrics Scenario 10
not ok — failedCount must equal all failure category counters (0 !== NaN)
```

After the implementation and test changes, the targeted run passed **24 tests, 0 failures** across metrics, Postgres, distributed aggregation and migrations. The full suite passed three consecutive times:

```text
Run 1: # tests 122  # pass 122  # fail 0  # cancelled 0
Run 2: # tests 122  # pass 122  # fail 0  # cancelled 0
Run 3: # tests 122  # pass 122  # fail 0  # cancelled 0
```

Every test file was also run separately: **23 files passed**, with 122 tests total and no failing or cancelled tests. This required loopback access because the integration tests start local HTTP servers; without that access the initial API tests failed at `fetch` before reaching application assertions.

## Standard verification

```text
npm run lint — PASS (tsc --noEmit)
npm run build — PASS (tsc --noEmit; vite build; 1,686 modules transformed)
git diff --check — PASS
Post-run node process check — no node processes remained
```

## Newly verified scaling benchmark

Command: `npm run bench:scaling`  
Target: self-started `http://127.0.0.1:5050/health`  
Workload: 8 VUs, 10 seconds per run, 3 rotated rounds, Node engine  
Environment: Windows 10.0.26300 x64, Ryzen 5 5600H (12 logical cores), 7.3 GB RAM, Node v22.14.0

| Workers | Median RPS | Min–max RPS | Median p50 | Median p95 | Ratio vs 1 worker |
|---:|---:|---:|---:|---:|---:|
| 1 | 2,662.87 | 2,659.50–2,703.15 | 1.52 ms | 2.66 ms | 1.00x |
| 2 | 5,118.68 | 4,581.38–5,137.22 | 0.79 ms | 1.32 ms | 1.92x |
| 4 | 8,691.37 | 8,485.59–8,745.24 | 0.48 ms | 0.88 ms | 3.26x |

There were no recorded errors in the nine measured runs. The benchmark script classifies the result as **Strong Sublinear Scaling**. The target and workers share one machine, so this is local multi-process evidence only.

Raw output:

- [Scaling report](../../../benchmarks/results/scaling-benchmark-2026-11-03T15-06-33-813Z.md)
- [Scaling JSON](../../../benchmarks/results/scaling-benchmark-2026-11-03T15-06-33-813Z.json)

## Changes

- Added redirect-specific failure counts to Node worker summaries, aggregation, JSON storage and Postgres storage; added migration `005_redirect_blocked_count.sql`.
- Added first-request-start to last-request-completion measurement windows for progress and final RPS; persisted the window in JSON and Postgres with migration `006_measurement_window.sql`.
- Kept k6 precision at four decimal places and labeled k6 result metadata.
- Hardened adaptive UI formatting for very small nonzero error rates.
- Removed fabricated run-detail/live-metric fallbacks; demo targets, seed runs and simulation data show a visible `Demo data` label, while missing metrics show `No data yet`.
- Added the `roadmap/**` CI branch pattern and documented metric/benchmark semantics.

## Known limitations / NOT VERIFIED

- k6 was not available in this environment. Its adapter currently returns aggregate failure counts rather than per-category counters.
- Zero-request runs retain legacy zero values for RPS and latency percentiles; treat these values as unavailable when `totalRequests` is zero.
- No real multi-machine or production-scale workload was attempted.
