# Roadmap Progress

Current phase: 3   Last updated: 2026-11-04T10:46:41Z   Branch: roadmap/phase-2-security   HEAD: 7c0072f

## Phase table

| Phase | Status | Gate result | Evidence file |
|---|---|---|---|
| 0 | done | PASS; see known limitations | [evidence/phase-0.md](evidence/phase-0.md) |
| 1 | done | PASS; V1–V6 passed five times, all standard checks passed, 3 full-suite passes, no leaked processes | [evidence/phase-1.md](evidence/phase-1.md) |
| 2 | done | PASS; lint/build, all 30 files, three full-suite passes, audit clean | [evidence/phase-2.md](evidence/phase-2.md) |
| 3 | in-progress | started from Phase 2 gate PASS | [evidence/phase-3.md](evidence/phase-3.md) |
| 4 | todo | not run | — |
| 5 | todo | not run | — |
| 6 | skipped | not approved in runbook | — |

## Task checklist

- [x] T0.0 Baseline recorded on the Phase 0 branch; all 23 unit/integration files pass individually after loopback-enabled execution.
- [x] T0.1 Added regression coverage for precise multi-worker RPS windows and redirect failure category; confirmed fail-before against starting commit and pass-after.
- [x] T0.2 Node worker, coordinator, progress, storage, API and frontend types now carry a separate blocked-redirect counter; RPS window semantics are defined and enforced.
- [x] T0.3 Kept four-decimal error-rate persistence and added Postgres migrations for redirect counts and measurement-window storage; JSON storage preserves both fields.
- [x] T0.4 Updated code against the current `activeRuns` coordinator shape; existing failure and reliability tests pass and terminate.
- [x] T0.5 Existing partial-worker fallback, duplicate-complete guard, exit-without-summary handling and IPC send callback are covered by integration tests.
- [x] T0.6 Benchmark runner forces Node; engine is carried in run results; k6 output keeps four-decimal error-rate precision and labels its engine.
- [x] T0.7 `cancelling` state is persisted by the current state machine and protected from invalid terminal transitions; reliability tests pass.
- [x] T0.8 Overview uses the percentage as returned, displays empty state without data, and seed runs are explicitly marked as demo data; error-rate formatting avoids rounding small nonzero counts to `0.00%`.
- [x] T0.9 Local cancellation matrix passes for 1/2/4 workers, early/late cancellation, terminal and unknown runs, tenant ownership and clean subsequent runs.
- [x] T0.10 Scaling benchmark ran against its self-started `127.0.0.1` target; report and raw JSON are saved in `benchmarks/results/`.
- [x] T0.11 CI already runs unit/integration tests; branch triggers now include `roadmap/**` while benchmark regression behavior is unchanged.
- [x] T0.12 Metrics semantics and benchmark result labels/limitations are documented.
- [x] T1.1 Added deterministic loopback-only `/fixed`, `/flaky`, `/graphql-errors`, `/hang`, `/big`, and `POST /__reset`; legacy endpoints remain. Fail-before was 404, and target integration tests pass. See [phase-1 evidence](evidence/phase-1.md#t11--deterministic-controlled-target).
- [x] T1.2 Added V1-V6 validation suite; all eight tests pass five consecutive times, timing tolerance is derived from measured variance. Evidence in [phase-1](evidence/phase-1.md#t12--validation-suite).
- [x] T1.3 Added bounded status/body/JSON-path assertions and `assertionFailureCount` across worker, aggregation, storage, API, and run detail. Evidence in [phase-1](evidence/phase-1.md#t13--safe-response-assertions).
- [x] T1.4 Ran DevFlow vs autocannon on loopback; k6 is marked NOT RUN because it is not installed. Evidence in [phase-1](evidence/phase-1.md#t14--cross-tool-comparison).
- [x] T1.5 Ran 10 samples each for 1 and 2 workers; mean, sample SD, and CV for RPS and p95 recorded with raw reports. Evidence in [phase-1](evidence/phase-1.md#t15--variance-study).
- [x] T1.6 Persisted and displayed host/runtime, runner version/commit, engine, and worker count metadata. Evidence in [phase-1](evidence/phase-1.md#t16--environment-metadata).

## Decision log

| Decision | Options considered | Reason |
|---|---|---|
| Work from a dedicated `roadmap/phase-0-correctness` worktree at `phase-7-distributed-runner` | Modify the existing `main` checkout or isolate the phase work | The existing checkout contained untracked `DEVFLOW_ROADMAP_RUNBOOK.md` and `demo/` user work; isolation preserved both. |
| Keep Node as the benchmark engine | `auto` could choose k6 for a one-worker run | The Phase 0 benchmark must compare the same runner implementation at each worker count. |
| Keep the existing aggregate-only k6 failure result documented | Add custom k6 status/error instrumentation or remove k6 support | k6 is optional and not installed/verified here; Node is the validated engine for Phase 0. |
| Continue Phase 1 in a dedicated roadmap worktree while leaving the dirty `main` checkout untouched | Stop until root untracked content is moved, or isolate this work | The owner explicitly said to proceed; the untracked content stays unchanged on `main`, and phase work is confined to `roadmap/phase-1-measurement-validation`. |
| Run test files sequentially in the full suite | Keep Node's default file-level parallelism | Parallel worker-heavy integration files interfered with cancellation timing; serial files reduce cross-test CPU contention while preserving each test's own concurrency coverage. |

## Deviations from this runbook

- Historical correctness fixes already present in the configured base branch were verified by regression tests rather than reimplemented.
- The working tree was kept on an isolated worktree because the original `main` checkout had unrelated untracked user content.
- The runbook's local commit policy is followed on this roadmap branch; no remote operation is performed.
- The initial Phase 1 attempt stopped at the runbook's dirty-checkout gate. After the owner said to proceed, Phase 1 resumed in an isolated roadmap worktree; root `main` user files remain untouched.

## BLOCKED items

- None currently. The initial dirty-checkout concern was handled by the owner's explicit instruction to proceed in a separate roadmap worktree; `main` remains untouched.

## Known limitations discovered

- The optional k6 adapter does not expose the Node engine's per-category failure counters; the adapter's aggregate failure count is retained and its scope is documented in `docs/METRICS.md`. k6 was not installed, so that path is NOT VERIFIED.
- For zero completed requests, legacy API/storage fields still use zero for RPS and latency percentiles; consumers should treat them as unavailable when `totalRequests` is zero. This compatibility behavior is documented in `docs/METRICS.md`.
- Benchmark workers and the test target share one Windows host; this does not verify multi-machine or production-scale behavior.

