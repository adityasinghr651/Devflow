# Phase 4 — Open-source packaging

Status: complete. Branch: `roadmap/phase-4-packaging`. Base HEAD: `bde3c7e`.

## T4.1 — Docker

Added multi-stage API and dashboard images, non-root Node API runtime, `/ready` health check, read-only API filesystem, PostgreSQL Compose service, and full environment template/config reference. **Docker runtime is NOT VERIFIED:** `docker --version` reports Docker is not installed in this environment. Compose, Action, release, and OpenAPI YAML parsed successfully with the available PyYAML parser.

## T4.2–T4.3 — CLI and GitHub Action

`bin/devflow.js` implements `run -c|--config`, `--api`, `--token`, `--wait`, and `--json`; checks required configuration and emits exit code 0 for a passing run, 1 for a completed failed run, and 2 for input/API/wait errors. Local CLI tests cover successful submission/result and invalid config. The composite Action uses an existing API URL, writes a JSON result artifact, and maintains one marked PR comment. Its metadata/behavior contract test passes. It was not executed against a live GitHub PR or hosted runner.

## T4.4–T4.7 — API, docs, community, examples

The hand-written `docs/openapi.yaml` covers every Express route and method; `tests/unit/openapi-contract.test.js` fails on path or method divergence. `/api/v1` aliases the routers; legacy `/api` remains usable and returns deprecation/sunset headers. Documentation links validate. README claims were rewritten to describe the local multi-process runner accurately. Community files and issue templates were added. No license was selected; the decision and repository settings are listed in `docs/roadmap/HUMAN_ACTIONS.md`. Examples use the local controlled target.

## T4.8–T4.9 — Quickstart and Node support

The clean install → target/API startup → registration → target save → run → report check passed on Windows. Latest recorded run: **30 seconds**, 4,017 completed requests, zero failed requests. `tools/quickstart-check.sh` is the requested entry point; on Windows it delegates to `tools/quickstart-check.ps1`. CI runs the Bash script on Linux. Package support is Node `>=22 <23`; the CI matrix contains Node 22.

## Reliability correction found during verification

The full-suite run exposed that the coordinator treated a worker's completion IPC summary as proof the child had exited. This let graceful shutdown return during the IPC-to-process-exit gap. The coordinator now waits for the child exit event before making the run terminal. Regression tests cover worker cleanup and duplicate completion handling. Cancellation tests now wait for persisted progress and process exit instead of fixed startup sleeps. A fresh local variance study (10 samples each at 1 and 2 workers) is preserved in `benchmarks/results/variance-study-2026-11-04T12-47-08-491Z.{json,md}`; it records that the worktree was dirty at measurement time. The validation bound is derived from that observed sample distribution.

## Standard verification

- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm audit --omit=dev`: 0 vulnerabilities. A normal full `npm ci` reports 3 moderate advisories in the full dependency tree; production dependency audit is clean.
- YAML parse for `action.yml`, Compose, release/performance workflows, OpenAPI, and example workflow: PASS.
- `node tools/check-doc-links.js`: PASS; 14 Markdown files checked.
- CLI, Action contract, OpenAPI contract, and API alias targeted tests: 5/5 PASS.
- Every `tests/unit/*.test.js` and `tests/integration/*.test.js` file run separately: 30 files, zero failures. The Windows signal-delivery case is skipped by design; it is covered by Linux CI and direct manager shutdown tests.
- `npm test` three consecutive final runs: each 151 tests, 150 passed, 0 failed, 1 Windows-only skip.
- Clean-install quickstart: PASS in 31 seconds.
- Process check after test runs: no Node process from the Phase 4 worktree remained.

## Remaining verification limits

- Docker image build and Compose runtime were not verified because Docker is unavailable.
- GitHub Action was contract-tested locally but not run on a hosted runner or live pull request.
- License choice, private vulnerability reporting setting, maintainer contact route, and release permissions remain human actions.
