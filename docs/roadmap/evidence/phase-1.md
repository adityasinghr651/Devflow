# Phase 1 Evidence — Measurement validation

Branch: `roadmap/phase-1-measurement-validation`
Starting commit: `1ee5424c1069eb0852c9138d1e2acbceba38caf9`
Runtime: Node `v22.14.0`, Windows (local loopback only)

## T1.1 — Deterministic controlled target

The regression test was added before the endpoint implementation. Before the change:

```text
node --test tests/integration/test-target.test.js
not ok 2 - Test Target: Deterministic measurement endpoints and reset
error: Expected values to be strictly equal: 404 !== 200
```

After the change, the same command completed with:

```text
# tests 2
# pass 2
# fail 0
```

The test target remains bound to `127.0.0.1`. Added `GET /fixed?delayMs=N`, deterministic `GET /flaky?everyN=K&status=S`, HTTP-200 GraphQL error fixture `GET /graphql-errors?everyN=K`, non-terminating `GET /hang`, bounded `GET /big?bytes=N`, and `POST /__reset`. Existing `/health`, `/slow`, `/status/:code`, `/mixed`, `/echo`, and `/large` endpoints remain. Delay is capped at 5 seconds; response bodies are capped at 512 KiB.

## T1.2 — Validation suite

Added `npm run test:validation` with V1–V6 coverage. The full suite passed 5 consecutive times: 8 tests per pass, 40 total passes, 0 failures. V5 canceled 1-, 2-, and 4-worker runs and verified all captured worker PIDs were gone. All traffic went to each test's self-started loopback target.

V2 uses the latest 10-run variance report for the same 4-VU/50ms-delay/1-worker workload. The measured p50 was 62.263 ms with a sample standard deviation of 0.3151 ms; its tolerance is 3 SD (0.9453 ms, with a 1 ms floor). RPS was 62.405 with sample SD 0.6694; its tolerance is 5 SD (3.347). The first full-suite run exposed a 4.47-SD throughput deviation while other files ran concurrently, so the RPS envelope accounts for occasional host scheduling contention. The test also checks the RPS estimate against Little's law within 8%, including measured client and target overhead.

## T1.3 — Safe response assertions

Run configuration now accepts exact status, literal `bodyContains`, and JSON path assertions with `equals`, `exists`, and `notExists`. JSON paths are limited to property names and numeric array indexes; prototype-related keys and unknown operators are rejected. Response reads stop at 64 KiB; an oversized body fails the assertion. Bodies are not read when assertions are absent. HTTP 200 GraphQL errors were counted as assertion failures, exact 404 status plus JSON value assertions passed, and a 65,537-byte body exceeded the cap and failed safely. Assertion failure counts are carried through workers, aggregation, JSON/Postgres storage, API data, and run detail UI.

Runs with assertions are pinned to the Node worker engine so an installed k6 binary cannot bypass configured response checks.

## T1.4 — Cross-tool comparison

Command: `npm run bench:cross-validate`. Raw results are in [cross-validation JSON](../../../benchmarks/results/cross-validation-2026-11-04T10-08-57-795Z.json) and [summary](../../../benchmarks/results/cross-validation-2026-11-04T10-08-57-795Z.md). On a local 4-connection/5-second/10ms-delay workload: DevFlow measured 253.14 RPS, p50 15.62ms, p95 16.39ms, p99 17.38ms; autocannon measured 257.61 RPS, p50 15ms and p99 16ms. RPS gap was -1.74%; p50 gap was +0.62ms and p99 gap +1.38ms. autocannon's summary does not expose p95, so that cell and gap are recorded as unavailable. k6 was not installed and is marked `NOT RUN`. This is a one-host comparison, not a claim that measurements or definitions match.

Added autocannon as a dev dependency because the runbook requires a reproducible independent HTTP load generator for cross-validation; it is not used in production runs.

## T1.5 — Variance study

Command: `node tools/variance-study.js`. The 10-run-per-worker raw samples and summary are in [variance JSON](../../../benchmarks/results/variance-study-2026-11-04T10-09-21-037Z.json) and [variance summary](../../../benchmarks/results/variance-study-2026-11-04T10-09-21-037Z.md). Four VUs ran for one second against a controlled 50ms delay. For one worker, RPS mean/SD/CV was 62.405 / 0.6694 / 1.0726%; p95 was 73.456ms / 4.7394ms / 6.4521%. For two workers, RPS was 62.493 / 0.4786 / 0.7659%; p95 was 70.181ms / 5.5795ms / 7.9501%. All 20 samples and host/runtime data are retained in JSON. The host's load generator and target share one machine.

## T1.6 — Environment metadata

Every newly executed run persists engine, worker count, Node version, OS/release/architecture, CPU model and logical core count, total memory, runner version, and commit as `environmentMetadata`. PostgreSQL migration 007 adds metadata/assertion fields; JSON storage records them directly. The run detail modal displays the metadata. V1 verified engine and worker count in the persisted run record.

## Phase 1 standard gate

Lint and build both passed after final code changes. All 24 unit, integration, and validation files passed individually. After setting `npm test` to run test files sequentially, the full suite passed three consecutive times after final code changes: 132 tests passed and 0 failed on each run. The process leak check found 0 matching worker, Vite, server, target, or benchmark processes both before and after the full gate. `git diff --check` passed. The first parallel full-suite attempts had cancellation timing failures under cross-file process contention; the serialized run resolved them. No remote push is permitted by the runbook.
