# Phase 3 Evidence — Reliability and operations

Branch: `roadmap/phase-3-reliability`
Parent commit: `888ab51` (Phase 2)
Gate status: PASS with platform limits noted, 2026-11-04

## T3.1–T3.8 results

- T3.1: `tests/integration/server-restart.test.js` starts the real API, begins a loopback run, SIGKILLs the API process, restarts it, and verifies the interrupted run is failed with `finishedAt` and a restart explanation. Passed.
- T3.2: `RunnerManager.shutdown()` cancels queued/active work, waits up to eight seconds, escalates worker kills, and flushes storage before closing. The active-run shutdown test verifies cancelled persistence and that worker PIDs are gone. The real child-process SIGTERM test is skipped on this Windows host because Windows terminates the child instead of delivering SIGTERM to Node's signal handler; the existing Ubuntu correctness workflow will execute that test on Linux. NOT VERIFIED locally for OS signal delivery.
- T3.3: Migration `008_duration_ceiling.sql` raises the schema ceiling to 3600 seconds. The real local PostgreSQL suite applied migrations from an empty test database and verified reapplication is idempotent, retention works, and existing lifecycle behavior passes. PostgreSQL CI service job is configured.
- T3.4: `/api/ready` checks storage availability; request/error and worker failures use structured JSON records with request/run/worker IDs and no headers, bodies, or query strings. Operations/configuration are documented in `docs/OPERATIONS.md`.
- T3.5: Worker startup and no-progress watchdogs, per-worker V8 heap cap, bounded histogram validation, and non-negative finite counters are implemented. Fake worker tests cover timeout, stalled progress, malformed payload, and heap flag.
- T3.6: 30-minute local loopback soak completed with 181 samples at 10-second intervals. After a 300-second warm-up:
  - Coordinator RSS median 56.08 MiB, spread 27.72 MiB; limit was max(50 MiB, 20% of median); PASS.
  - Worker RSS median 89.04 MiB, spread 1.80 MiB; same limit; PASS.
  - Worker heap median 19.78 MiB, spread 20.04 MiB; limit was max(64 MiB, 25% of median); PASS.
  - The CSV records event-loop lag. Windows does not expose `/proc/self/fd`, so descriptor samples are blank (NOT AVAILABLE on this host).
  - Raw CSV: `benchmarks/results/soak-2026-11-04T11-32-40-350Z.csv`; summary: `benchmarks/results/soak-2026-11-04T11-32-40-350Z-summary.json`.
- T3.7: Chaos tests kill each of four worker indices and verify failed state plus sibling reaping. Server SIGKILL/restart reconciliation passes. PostgreSQL pool shutdown/recovery passes in `tests/integration/failure-injection.test.js` with `DATABASE_URL` set to the local PostgreSQL test service.
- T3.8: Terminal run retention is capped per user in JSON and PostgreSQL and is documented. JSON and live PostgreSQL retention tests pass.

## Soak investigation

Two earlier attempts exposed heap growth and are retained as raw evidence:

- `soak-2026-11-04T10-56-39-971Z`: worker exhausted a 256 MiB heap after about 560 seconds.
- `soak-2026-11-04T11-07-42-579Z`: worker exhausted a 512 MiB heap after about 1470 seconds.

The worker created a timeout and combined abort signal for every request. The implementation now creates one request controller, explicitly clears each request timer, and removes the run-cancellation listener after each fetch. The third 30-minute run completed and worker RSS/heap stayed within the thresholds above.

## Verification

```text
npm run lint                         PASS (tsc --noEmit)
npm run build                        PASS (Vite production build)
all 28 test files separately        PASS; 145 passed, 0 failed; one Windows-only signal test skipped
npm test, three consecutive runs     PASS; 146 total each, 145 passed, 0 failed, 1 skipped
PostgreSQL migration/integration     PASS against local PostgreSQL
PostgreSQL pool outage scenario      PASS with DATABASE_URL set
process check                        same Node process IDs before/after; no test-created Node workers remained
```

One initial full-suite attempt exposed a missing ID in the PostgreSQL retention fixture and intermittent JSON cleanup races. The fixture now provides UUIDs; runner shutdown and storage flush happen before temporary directories are removed. Targeted checks and the final full-suite passes were clean. A separate validation timing run once missed the measured RPS envelope under host scheduling variance; a retry and the final full-suite passes succeeded without changing the measured tolerance.

## Remaining platform notes

- Signal delivery through an actual Windows child process is not representative of Linux SIGTERM semantics; the Ubuntu CI workflow runs that test.
- File descriptor counts are unavailable in the Windows soak CSV.
- Soak results describe one Windows machine and a loopback target only; they do not establish multi-host behavior or production scale.

