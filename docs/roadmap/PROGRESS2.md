# Regression-Gate Roadmap Progress

Current phase: 4   Last updated: 2026-11-12   Branch: roadmap2/phase-4-pilot   HEAD: 956ea5d6b58297edd3d8c901ee0d170ad9a64b15

## Phase table

| Phase | Status | Gate result | Evidence file |
|---|---|---|---|
| 1 | done | pass with documented local credential exception | docs/roadmap/evidence/phase2-1-security.md |
| 2 | done | pass with documented +10% sensitivity limitation | docs/roadmap/evidence/phase2-2-regression-studies.md |
| 3 | done | pass with live Action not verified | docs/roadmap/evidence/phase2-3-adoption.md |
| 4 | blocked | NOT VERIFIED: owner has not approved pilot or supplied repositories | docs/roadmap/evidence/phase2-4-pilot.md |
| 5 | blocked | Phase 4 has no real pilot signal | docs/roadmap/evidence/phase2-5-positioning.md |
| 6 | blocked | Phases 4 and 5 are gated; owner decisions pending | docs/roadmap/evidence/phase2-6-monetization.md |

## Task checklist

- [x] T1.1 Reproduced prior OAuth takeover (200 + token) from preserved evidence; current live route returns 400 with no token; auth flow tests pass.
- [x] T1.2 Tenant/resource matrix passes. Reproduced wrong-user campaign cancel returning 409; added failing-first coverage and fixed it to return 404.
- [x] T1.3 Replaced fixed account passwords in test/quickstart/regression fixtures with random credentials. Documented negative fixtures, untracked Saleor demo and owner-selected local admin credential exception.
- [x] T1.4 `npm audit --omit=dev`: 0 vulnerabilities.
- [x] T1.5 `npm test` ran 3 consecutive times: each 181 passed, 1 Windows skip, 0 failed; each terminated normally.
- [x] Phase 1 standard verification passed: lint, build, 39 individual test files, full suite 3x, `git diff --check`; evidence at `docs/roadmap/evidence/phase2-1-security.md`.
- [x] T2.1 Documented the actual fingerprint, owner-scoped comparable-run filter, last-five baseline window, minimum three samples, median/MAD bands, thresholds, and verdicts in `docs/REGRESSION_MODEL.md`.
- [x] T2.2 20 stable CLI/API/runner measurements; 17 eligible, 0 false regression verdicts (0/17).
- [x] T2.3 Five trials per injected magnitude: +10% detected 0/5, +25% 5/5, +50% 5/5; raw JSON and summaries saved.
- [x] T2.4 Kept policy unchanged: observed stable false-positive count was 0/17; the +10% miss agrees with the documented 19.3563% minimum p95 change and this sample is too small to safely retune.
- [x] T2.5 API response now includes baseline window size; CLI and PR comment disclose used/available baseline window and minimum, with metric bands. Missing measurements remain unavailable and yield `insufficient_data`.
- [x] Phase 2 standard verification passed: lint, build, 39 individual test files, full suite twice (183 tests per run; 182 pass, 1 Windows skip, 0 fail); evidence at `docs/roadmap/evidence/phase2-2-regression-studies.md`.
- [x] T3.1 Added `devflow check` with config defaults, `--init`, safe environment-token usage, verdict/count output and tested exit codes.
- [x] T3.2 Action now links its JSON artifact and upserts a single PR comment; mocked GitHub API create/update tests pass. Live CI remains NOT VERIFIED.
- [x] T3.3 Clean-install Windows quickstart completed `devflow check` in 42 seconds: 5,779 successes, 0 failures, first-run `insufficient_data` verdict.
- [x] T3.4 Added `docs/WHY_DEVFLOW.md` with honest local evidence and sourced k6/Locust/Bencher comparisons. README/landing rewrite awaits Phase 4 evidence.
- [x] Phase 3 standard verification passed: lint, build, 40 per-file suites, full suite twice (188 each, 187 pass, 1 Windows skip, 0 failures); evidence at `docs/roadmap/evidence/phase2-3-adoption.md`.
- [ ] T4.0–T4.4 blocked: `PILOT_REPOS_APPROVED=false`; no owner list of 3–10 repositories was supplied. No external repo or target was touched; reason recorded in `docs/roadmap/evidence/phase2-4-pilot.md`.
- [ ] Phase 5 and Phase 6 remain gated on real pilot evidence and owner decisions.

## Security findings

- Untracked pre-existing `demo/` contains a separate Saleor sample application with `changeme` environment placeholders and hardcoded sample/test passwords; it is outside DevFlow source and was not changed/staged.
- The local owner-created administrator account uses a short password selected earlier at the owner's request. It is hashed in the loopback-only local database and absent from tracked source. Change it before exposing the instance beyond localhost; the value is intentionally not recorded.
- Fixed test passwords were found in account-creation fixtures and quickstart/experiment scripts; those fixtures now generate random credentials. Remaining tracked literals are a common-password denylist and weak-password rejection fixtures/direct hash unit test.
- Full `npm audit` during clean-install quickstart reports 3 moderate findings through dev dependency `autocannon@8` → `hyperid` → `uuid <11.1.1` (GHSA-w5hq-g745-h8pq). Production dependency audit remains clean (`npm audit --omit=dev`: 0 vulnerabilities). npm's suggested fix forces `autocannon@9`, a breaking upgrade; defer that compatibility change for a separate review rather than applying it without testing.

## Decision log

| Decision | Reason |
|---|---|
| Create `roadmap2/phase-1-security` from `main` at `f68fae9`. | Follow the runbook's isolation and phase-branch policy while preserving the existing untracked `.worktrees/`, runbook, and `demo/` content. |
| Do not push. | Runbook explicitly requires approval before any push; none was given. |
| Preserve `docs/roadmap/PROGRESS.md` and historical evidence. | This is a separate roadmap and must not overwrite earlier runbook artifacts. |
| Fixed campaign cancel ownership check after reproducing wrong-owner HTTP 409. | Wrong-owner actions must be consistently hidden with 404 before the resource state is checked. |
| Use cryptographically random per-run credentials in account-creating tests and scripts. | Removes reusable hardcoded passwords while preserving production password-policy coverage. |
| Validate regression model through the CLI instead of only calling the detector directly. | Matches the real adoption pipeline; raw study results include the CLI report and comparison bands. |
| Do not tune detector thresholds before measuring controlled behavior. | T2.4 changes must be evidence-driven and followed by remeasurement. |
| Promote only the disposable temporary study account to the existing paid tier. | The first real CLI study hit the Free lifetime cap at 15 runs; the 20-run baseline needs room, and production quotas remain unchanged. The incomplete run produced no study artifact. |
| Defer README/landing-page repositioning until the pilot gate. | Phase 5 requires real pilot evidence; Phase 3 creates a separate evidence-aware Why page without claiming adoption. |
| Keep Phase 4 blocked and do not run an external Action. | `PILOT_REPOS_APPROVED=false` and no owner repository list was provided. |

## BLOCKED items

- Phase 4 pilot approval is false and no pilot repository list was supplied. Do not point CI at external repositories without that approval.
- Phases 5–6 cannot start until the Phase 4 gate produces real pilot signal.

## Known limitations

- Any live OAuth verification is limited to mocked provider endpoints unless real provider credentials are provided.
- A real external-repository CI pilot is not authorized or configured.
- The hosted GitHub Action, real PR artifact download, and comment update lifecycle remain NOT VERIFIED until an approved external pilot runs.
