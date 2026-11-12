# Phase 3 — Adoption evidence

Date: 2026-11-12
Branch: `roadmap2/phase-3-adoption`
Base commit: `a5b864ee9e10fa00f0455a3923af705f2fb2c9ad`
Machine: Windows 11 (`win32`, release `10.0.26300`), AMD Ryzen 5 5600H, 12 logical CPUs, Node `v22.14.0`

## T3.1 One-command CLI check

Added `devflow check`, which loads `devflow.config.json` by default, supports config/API flags, gets its token from `DEVFLOW_TOKEN`, invokes the same run and regression API flow, reports counts and baseline bands, and retains exit codes 0/1/2. `devflow check --init` creates a starter config without overwriting an existing file. Config API/token helper fields are removed before submitting the workload.

`node --test tests/unit/cli.test.js`: 5 passed, 0 failed. Tests cover successful CLI run, regression exit code 1, invalid configuration exit code 2, check config and environment token handling, and safe initialization.

## T3.2 GitHub Action

The composite Action uploads the JSON report and supplies the upload artifact URL to its PR comment step. Comment generation reports the verdict, current/minimum baseline window, request counts, and metric bands. A small helper upserts one marked comment; mocked tests cover both create and update behavior and verify the direct artifact URL.

`node --test tests/unit/action-comment.test.js tests/unit/action-contract.test.js`: 4 tests passed, 0 failed. `python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8'))"` parsed `action.yml`. A live hosted GitHub Actions run and a live repository comment remain **NOT VERIFIED** pending Phase 4 approval.

## T3.3 Clean-install quickstart timing

Ran `powershell -NoProfile -ExecutionPolicy Bypass -File tools/quickstart-check.ps1` from a clean install. The script installed dependencies, started the local API and target, created a temporary account/target/config, invoked `devflow check`, and cleaned up.

```text
status: completed
totalRequests: 5779
successCount: 5779
failedCount: 0
regressionVerdict: insufficient_data
Quickstart elapsed: 42 seconds
QUICKSTART_EXIT=0
```

`insufficient_data` is expected for the first run because no comparable history exists yet. The first quickstart attempt exposed a Windows PowerShell 5.1 cryptographic API incompatibility; the script now uses `RandomNumberGenerator.Create().GetBytes()` and the clean-install retry above passed.

## T3.4 New positioning documentation

Added [Why DevFlow](../../WHY_DEVFLOW.md), which leads with the product goal of catching performance regressions on PRs and reports the measured local sensitivity limits. It compares DevFlow with manual k6/Locust workflows and Bencher without claiming superiority. `README.md`/landing-page positioning remains gated on Phase 4 pilot signal, as directed by the runbook.

The new GitHub Action example is [github-action-quickstart.yml](../../../examples/github-action-quickstart.yml). Local documentation links were checked with `node tools/check-doc-links.js`: 18 documentation files checked, no broken local links.

## Standard verification

- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed; Vite transformed 1,689 modules and built production assets.
- All 40 test files in `tests/unit`, `tests/integration`, and `tests/validation` were run separately: 187 passed, 1 skipped, 0 failed.
- Two final uninterrupted `npm test` runs passed and exited by themselves:
  - Run 1: 188 tests, 187 passed, 1 skipped, 0 failed; 99,108 ms.
  - Run 2: 188 tests, 187 passed, 1 skipped, 0 failed; 99,852 ms.
- The one skip is the existing Windows-incompatible child-process signal test in `server-restart.test.js`.
- `git diff --check`, documentation-link check, Action YAML parse, and `npm audit --omit=dev` passed. The production dependency audit found 0 vulnerabilities.
- A full-suite attempt straddled an overnight machine suspension and failed its campaign coordinator-start timing check, leaving a stale process. The campaign test then passed alone (5/5, 2.2 seconds), the stale suite process was stopped, and both final full-suite reruns above passed normally.

## Gate result

Phase 3 gate: **PASS WITH LIVE ACTION NOT VERIFIED**. The CLI path, mocked Action comment logic, clean-install quickstart, and documentation are verified locally. An external hosted Action run requires approved pilot repositories in Phase 4.
