# Phase 5 — Statistical regression detection

Status: PASS. Branch: `roadmap/phase-5-regression`.

## Tasks

- **T5.1 Fingerprint:** SHA-256 of target, normalized method/path/query, concurrency, duration, profile/stages, engine, worker count, and assertions. Query ordering is normalized. Only completed runs with matching owner, target and fingerprint can enter history; demo, partial-worker, and incomplete-histogram runs are excluded.
- **T5.2 Model:** uses up to the last five comparable runs, requiring at least three. Median and scaled MAD (`1.4826 × MAD`) define a three-scaled-MAD band. A regression requires a directional band violation and the Phase 1 minimum relative change. Deterministic tests cover normalization, exclusions, insufficient history, outliers, both thresholds, metric directions and incomplete runs.
- **T5.3 API/CLI/Action:** authenticated owner-scoped `GET /runs/{id}/regression` returns verdict, exact baseline IDs, observed values, medians and bands. CLI JSON/readable output includes the verdict and exits 1 on regression; a mock-server test verifies it. The composite Action comment includes verdict, bands and exact request/assertion counts. Existing fixed-percentage benchmark comparator remains covered by its tests.
- **T5.4 UI:** Comparisons view loads the latest completed run's verdict and shows status, baseline count, fingerprint, metric values/bands, and insufficient-data warnings. TypeScript and production build pass; styling uses the app's light/dark theme variables.
- **T5.5 Experiment:** run with `npm run regression:experiment`; raw results: [`regression-experiment-2026-11-04T13-49-18-811Z.json`](../../../benchmarks/results/regression-experiment-2026-11-04T13-49-18-811Z.json).

## Local experiment results

On Windows 11 (build 26300), Node v22.14.0, one worker, the loopback target returned controlled 50 ms responses for 20 identical `/health` workload runs (4 concurrency, 2 seconds). The first three comparisons did not yet have the minimum three-run history; 17 comparisons were eligible and produced **0 false positives (0/17, observed 0%)**.

The target then changed its internal response delay to 150 ms while the DevFlow URL and workload fingerprint remained identical. One injected slowdown run was classified `regression`; **detection was 1/1 (observed 100%)**, with RPS, p95 and p99 marked as regressions. The raw report includes every run. These are small, single-host experiment counts, not a general false-positive or detection-rate guarantee.

## Verification

- `npm run lint`: PASS.
- `npm run build`: PASS.
- Targeted regression API, synthetic model, CLI and Action contract tests: **13 passed, 0 failed**.
- Full suite run 1: **160 passed, 1 skipped (Windows SIGTERM limitation), 0 failed**; duration 97.4 seconds.
- Full suite run 2: **160 passed, 1 skipped, 0 failed**; duration 95.0 seconds.
- Full suite run 3: **160 passed, 1 skipped, 0 failed**; duration 95.8 seconds.
- All **32** unit and integration test files were also run individually; each had zero failures. `server-restart.test.js` had its expected Windows SIGTERM test skipped; all others had zero skips.
- `git diff --check`: PASS. Windows process check found no remaining `node` processes with a DevFlow command line after the experiment and test runs.
- Phase 6 remains unapproved and was not started.

Gate 5: **PASS**.
