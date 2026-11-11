# Regression-Gate Roadmap Progress

Current phase: 2   Last updated: 2026-11-11   Branch: roadmap2/phase-2-regression   HEAD: a4c2df2bd37b44082b0bd4a69f22943e5da0a648

## Phase table

| Phase | Status | Gate result | Evidence file |
|---|---|---|---|
| 1 | done | pass with documented local credential exception | docs/roadmap/evidence/phase2-1-security.md |
| 2 | in progress | pending | docs/roadmap/evidence/phase2-2-regression-studies.md |
| 3 | not started | pending | docs/roadmap/evidence/phase2-3-adoption.md |
| 4 | not started | blocked pending owner approval and repo list | docs/roadmap/evidence/phase2-4-pilot.md |
| 5 | not started | gated on real Phase 4 signal | docs/roadmap/evidence/phase2-5-positioning.md |
| 6 | not started | gated on Phases 4 and 5 | docs/roadmap/evidence/phase2-6-monetization.md |

## Task checklist

- [x] T1.1 Reproduced prior OAuth takeover (200 + token) from preserved evidence; current live route returns 400 with no token; auth flow tests pass.
- [x] T1.2 Tenant/resource matrix passes. Reproduced wrong-user campaign cancel returning 409; added failing-first coverage and fixed it to return 404.
- [x] T1.3 Replaced fixed account passwords in test/quickstart/regression fixtures with random credentials. Documented negative fixtures, untracked Saleor demo and owner-selected local admin credential exception.
- [x] T1.4 `npm audit --omit=dev`: 0 vulnerabilities.
- [x] T1.5 `npm test` ran 3 consecutive times: each 181 passed, 1 Windows skip, 0 failed; each terminated normally.
- [x] Phase 1 standard verification passed: lint, build, 39 individual test files, full suite 3x, `git diff --check`; evidence at `docs/roadmap/evidence/phase2-1-security.md`.
- [x] T2.1 Documented the actual fingerprint, owner-scoped comparable-run filter, last-five baseline window, minimum three samples, median/MAD bands, thresholds, and verdicts in `docs/REGRESSION_MODEL.md`.
- [ ] T2.2 CLI-driven 20-run stable-target false-positive study; harness added, live repetitions pending.
- [ ] T2.3 Controlled +10%/+25%/+50% latency study with five independent trials each; harness added, live repetitions pending.
- [ ] T2.4 Noise reduction will be based on the measured studies; no detector thresholds changed yet.
- [x] T2.5 API response now includes baseline window size; CLI and PR comment disclose used/available baseline window and minimum, with metric bands. Missing measurements remain unavailable and yield `insufficient_data`.
- [ ] Phase 3 tasks T3.1–T3.4 remain pending Phase 2 gate.
- [ ] Phase 4 tasks T4.0–T4.4 require approved pilot repositories.
- [ ] Phase 5 and Phase 6 remain gated on real pilot evidence and owner decisions.

## Security findings

- Untracked pre-existing `demo/` contains a separate Saleor sample application with `changeme` environment placeholders and hardcoded sample/test passwords; it is outside DevFlow source and was not changed/staged.
- The local owner-created administrator account uses a short password selected earlier at the owner's request. It is hashed in the loopback-only local database and absent from tracked source. Change it before exposing the instance beyond localhost; the value is intentionally not recorded.
- Fixed test passwords were found in account-creation fixtures and quickstart/experiment scripts; those fixtures now generate random credentials. Remaining tracked literals are a common-password denylist and weak-password rejection fixtures/direct hash unit test.

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

## BLOCKED items

- Phase 4 pilot approval is false and no pilot repository list was supplied. Do not point CI at external repositories without that approval.
- Phases 5–6 cannot start until the Phase 4 gate produces real pilot signal.

## Known limitations

- Any live OAuth verification is limited to mocked provider endpoints unless real provider credentials are provided.
- A real external-repository CI pilot is not authorized or configured.
