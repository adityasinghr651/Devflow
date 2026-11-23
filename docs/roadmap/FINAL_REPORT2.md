# DevFlow regression-gate reposition runbook — final report

Original evidence run: 2026-11-12. Status update: 2026-11-23.
Pre-pilot positioning and monetization groundwork: `roadmap2/phase-5-positioning-prepilot` (local).
The README framing was pushed to `main` in `95014f9`; the landing, sidebar, docs, and settings changes remain on the local phase branch.

## A. Phase status

| Phase | Status | Evidence |
|---|---|---|
| 1 — Security and correctness | Done; pass with a documented local-account exception | [Phase 1 evidence](evidence/phase2-1-security.md) |
| 2 — Regression detector trust | Done; pass with a measured +10% sensitivity limitation | [Phase 2 evidence](evidence/phase2-2-regression-studies.md) |
| 3 — Adoption | Done; pass locally; live hosted Action not verified | [Phase 3 evidence](evidence/phase2-3-adoption.md) |
| 4 — Real pilot | Deferred by owner; three candidate repositories supplied and access verified, but no CI run or target traffic has occurred | [Phase 4 status](evidence/phase2-4-pilot.md) |
| 5 — Product repositioning | Partial: pre-pilot README/landing/nav/docs work done with explicit pilot caveat; case study and evidence review pending | [Phase 5 status](evidence/phase2-5-positioning.md) |
| 6 — Monetization groundwork | Partial: clearly labeled feature hypothesis and current access-plan view prepared; pilot interview validation pending | [Phase 6 status](evidence/phase2-6-monetization.md) |

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

The owner supplied three candidate repositories and the connected GitHub account was verified as an admin on each. At the owner's request, testing is deferred. No external repository was modified and no external target received load. Consequently there are no pilot PR counts, owner-confirmed alarms, developer-retention responses, or willingness-to-pay feedback. Those values are **NOT VERIFIED**, not zero. The remaining URL, hosted API, secret, and workflow requirements are listed in [the pilot evidence](evidence/phase2-4-pilot.md).

## E. Adoption work and positioning

Added `devflow check` with config defaults, `--init`, environment-token support, report counts/bands, and exit codes. The Action uploads a JSON artifact and maintains one PR comment with the verdict, baseline window, decision bands, and a direct artifact link. Mocked tests cover comment creation and update. A clean Windows install-to-first-check took 42 seconds and completed 5,779 requests with zero failures; its expected first-run verdict was `insufficient_data`.

Added [Why DevFlow](../WHY_DEVFLOW.md) with careful k6, Locust, and Bencher comparisons and the local study limitations. Following the owner's request to prepare the remaining phases before testing, the README and landing hero now lead with the CI regression-check workflow while explicitly saying the hosted pilot has not run. The app navigation/docs put CI setup before exploratory load-testing screens. No pilot case study was written. The free-vs-hosted split in [PRICING.md](../PRICING.md) is labeled as an unvalidated hypothesis with no price or launch commitment.

## F. Verification, limitations, and owner actions

- Phase 3 standard verification: lint and build passed; 40 test files passed individually; two final full-suite runs each reported 188 tests, 187 passed, 1 Windows-only skip, and 0 failures. Both exited normally.
- A full-suite attempt straddled an overnight machine suspension and failed a campaign coordinator-start timing check, leaving a stale process. The campaign test passed alone, that stale test tree was stopped, and two clean full-suite reruns then passed.
- Action YAML parsed; mocked GitHub API tests passed. A live hosted Action, direct artifact download, and PR-comment lifecycle are **NOT VERIFIED** until an approved repository pilot runs.
- Real OAuth provider behavior was not exercised because provider credentials were unavailable.
- `npm audit` (including dev dependencies) reported three moderate findings in `autocannon@8` → `hyperid` → `uuid <11.1.1`; npm's suggested remedy forces breaking `autocannon@9`. Production-only audit remains clean. Review and test that upgrade separately.
- The study covers one Windows host, one loopback fixed-delay endpoint, and one workload. No other machines, CI hosts, production applications, or teams were measured.

Remaining pilot setup is listed in [HUMAN_ACTIONS.md](HUMAN_ACTIONS.md): supply approved target URLs and a reachable hosted DevFlow API, configure repository secrets, and review the exact workflow changes. `Buy-or-Wait` needs an HTTP adapter or replacement candidate. Also review the dev-dependency upgrade and change the local admin password before exposing that local instance.

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
| Real pilot run | NOT VERIFIED; owner supplied candidates but requested testing later | [Phase 4](evidence/phase2-4-pilot.md) |
| Pre-pilot positioning | PARTIAL; README/landing/nav/docs changed; case study and pilot validation pending | [Phase 5](evidence/phase2-5-positioning.md) |
| Pricing draft | PRE-PILOT HYPOTHESIS; no prices and no pilot feedback yet | [Phase 6](evidence/phase2-6-monetization.md), [PRICING.md](../PRICING.md) |

## H. Truthful project summary

DevFlow is an open-source HTTP load-testing platform with saved targets, run history, a CLI regression check, and a GitHub Action that summarizes comparable-run decisions. On a single Windows host and controlled local target, its current study observed zero false regression verdicts in 17 eligible stable comparisons, detected +25% and +50% injected latency in five of five trials each, and missed all five +10% trials. The CLI quickstart completed locally in 42 seconds. No external CI pilot has run yet, so broader detector accuracy and developer adoption remain unverified.
