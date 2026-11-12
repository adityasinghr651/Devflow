# DevFlow regression-gate reposition runbook — final report

Date: 2026-11-12
Execution branch: `roadmap2/phase-4-pilot`
Changes are committed locally on the `roadmap2/phase-1-security`, `roadmap2/phase-2-regression`, `roadmap2/phase-3-adoption`, and `roadmap2/phase-4-pilot` branches. Nothing was pushed.

## A. Phase status

| Phase | Status | Evidence |
|---|---|---|
| 1 — Security and correctness | Done; pass with a documented local-account exception | [Phase 1 evidence](evidence/phase2-1-security.md) |
| 2 — Regression detector trust | Done; pass with a measured +10% sensitivity limitation | [Phase 2 evidence](evidence/phase2-2-regression-studies.md) |
| 3 — Adoption | Done; pass locally; live hosted Action not verified | [Phase 3 evidence](evidence/phase2-3-adoption.md) |
| 4 — Real pilot | Blocked; not verified because owner approval and repository list are absent | [Phase 4 status](evidence/phase2-4-pilot.md) |
| 5 — Product repositioning | Blocked on Phase 4 signal; no README/landing rewrite or case study was made | — |
| 6 — Monetization groundwork | Blocked on Phases 4 and 5; no pilot learnings or pricing changes | — |

## B. Phase 1 security prerequisite

The historical OAuth exploit sent only `{ "provider": "github", "email": "victim@example.com" }`; the previous implementation returned HTTP 200 and a token. Preserved evidence records the failing-before output. The current live HTTP route returns 400 without a token, and the authentication flow test passes.

The resource ownership matrix passed for targets, runs, campaigns, regression data, verification, and tier/admin routes. A wrong-owner campaign cancel initially returned 409; a failing-first test reproduced it, and the route now checks ownership first and returns 404.

Account-creating test, quickstart, and regression-experiment fixtures now use random credentials. Bootstrap uses the same password validator as registration. `npm audit --omit=dev` found zero production dependency vulnerabilities. Three full Phase 1 suite runs passed with one existing Windows-only child-process skip each.

Exception: the workspace's owner-selected local admin password is shorter than policy. It is hashed in the local database, is absent from tracked code, and the API is loopback-bound. Change it before exposing this local instance beyond localhost; the credential is not repeated here.

## C. Phase 2 regression-detector results

The model uses the five most recent comparable runs and requires at least three. It fingerprints target, method, normalized path/query, concurrency, duration, profile/stages, engine, worker count, and assertions. Complete, non-demo, full-histogram runs are eligible. Median/MAD bands, minimum metric changes, verdicts, and missing-data behavior are documented in [REGRESSION_MODEL.md](../REGRESSION_MODEL.md).

On one Windows machine, through the actual CLI → API → runner → regression API path:

- Stable 50 ms endpoint: 20 runs, 17 eligible comparisons, 0 false regression verdicts (0/17).
- +10% injected latency: 0/5 detected.
- +25% injected latency: 5/5 detected.
- +50% injected latency: 5/5 detected.

The +10% miss is consistent with the current 19.3563% p95 minimum-change threshold. The 0/17 stable sample is too small to justify lowering that threshold. These are internal local observations, not broad accuracy guarantees. The raw per-run data is in [regression-study-raw.json](../../benchmarks/results/regression-study-raw.json).

## D. Pilot results — no external pilot was run

`PILOT_REPOS_APPROVED=false`, and no 3–10 repository list was supplied. No external repository was modified and no external target received load. Consequently there are no pilot PR counts, owner-confirmed alarms, developer-retention responses, or willingness-to-pay feedback. Those values are **NOT VERIFIED**, not zero. Phase 4's blocked status is documented in [the pilot evidence](evidence/phase2-4-pilot.md).

## E. Adoption work and positioning

Added `devflow check` with config defaults, `--init`, environment-token support, report counts/bands, and exit codes. The Action uploads a JSON artifact and maintains one PR comment with the verdict, baseline window, decision bands, and a direct artifact link. Mocked tests cover comment creation and update. A clean Windows install-to-first-check took 42 seconds and completed 5,779 requests with zero failures; its expected first-run verdict was `insufficient_data`.

Added [Why DevFlow](../WHY_DEVFLOW.md) with careful k6, Locust, and Bencher comparisons and the local study limitations. The README headline, landing hero, and a pilot case study remain untouched because Phase 5 requires real Phase 4 evidence.

## F. Verification, limitations, and owner actions

- Phase 3 standard verification: lint and build passed; 40 test files passed individually; two final full-suite runs each reported 188 tests, 187 passed, 1 Windows-only skip, and 0 failures. Both exited normally.
- A full-suite attempt straddled an overnight machine suspension and failed a campaign coordinator-start timing check, leaving a stale process. The campaign test passed alone, that stale test tree was stopped, and two clean full-suite reruns then passed.
- Action YAML parsed; mocked GitHub API tests passed. A live hosted Action, direct artifact download, and PR-comment lifecycle are **NOT VERIFIED** until an approved repository pilot runs.
- Real OAuth provider behavior was not exercised because provider credentials were unavailable.
- `npm audit` (including dev dependencies) reported three moderate findings in `autocannon@8` → `hyperid` → `uuid <11.1.1`; npm's suggested remedy forces breaking `autocannon@9`. Production-only audit remains clean. Review and test that upgrade separately.
- The study covers one Windows host, one loopback fixed-delay endpoint, and one workload. No other machines, CI hosts, production applications, or teams were measured.

Required owner input is listed in [HUMAN_ACTIONS.md](HUMAN_ACTIONS.md): provide 3–10 pilot repositories and explicitly approve adding DevFlow to their CI. Also review the dev-dependency upgrade and change the local admin password before exposing that local instance.

## G. Evidence checklist

| Area | Status | Evidence |
|---|---|---|
| Auth bypass fixed | PASS | [Phase 1](evidence/phase2-1-security.md), [historical reproduction](evidence/tiered-access.md) |
| Tenant isolation | PASS | [Phase 1](evidence/phase2-1-security.md) |
| Regression model documented | PASS | [REGRESSION_MODEL.md](../REGRESSION_MODEL.md) |
| False-positive rate | PASS for this local study only | [Study](../../benchmarks/results/false-positive-study.md) |
| True-positive rate | PASS for this local study only; +10% was missed | [Study](../../benchmarks/results/true-positive-study.md) |
| CLI + Action tested | PASS locally with mocked GitHub API | [Phase 3](evidence/phase2-3-adoption.md) |
| Quickstart timing | PASS, 42 seconds on Windows | [Phase 3](evidence/phase2-3-adoption.md) |
| Real pilot run | NOT VERIFIED; blocked pending approval and repo list | [Phase 4](evidence/phase2-4-pilot.md) |
| Repositioned docs | PARTIAL; Why page exists, README/landing/case study await pilot | [Why DevFlow](../WHY_DEVFLOW.md) |
| Pricing draft based on pilot | NOT VERIFIED; Phase 6 remains gated | — |

## H. Truthful project summary

DevFlow is an open-source HTTP load-testing platform with saved targets, run history, a CLI regression check, and a GitHub Action that summarizes comparable-run decisions. On a single Windows host and controlled local target, its current study observed zero false regression verdicts in 17 eligible stable comparisons, detected +25% and +50% injected latency in five of five trials each, and missed all five +10% trials. The CLI quickstart completed locally in 42 seconds. No external CI pilot has run yet, so broader detector accuracy and developer adoption remain unverified.
