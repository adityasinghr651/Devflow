# Regression-Gate Roadmap Progress

Current phase: 6   Last updated: 2026-11-23   Branch: roadmap2/phase-5-positioning-prepilot   HEAD: see `git log -1` (this file is committed in the branch tip)

## Phase table

| Phase | Status | Gate result | Evidence file |
|---|---|---|---|
| 1 | done | pass with documented local credential exception | docs/roadmap/evidence/phase2-1-security.md |
| 2 | done | pass with documented +10% sensitivity limitation | docs/roadmap/evidence/phase2-2-regression-studies.md |
| 3 | done | pass locally; hosted Action not verified | docs/roadmap/evidence/phase2-3-adoption.md |
| 4 | deferred | 3 owner-selected repos; no hosted CI or target run yet | docs/roadmap/evidence/phase2-4-pilot.md |
| 5 | partial | pre-pilot positioning done; case study and pilot validation deferred | docs/roadmap/evidence/phase2-5-positioning.md |
| 6 | partial | pre-pilot pricing hypothesis and access-plan view ready; user validation deferred | docs/roadmap/evidence/phase2-6-monetization.md |

## Task checklist

- [x] T1.1–T1.5 Security and isolation fixes reproduced, implemented, and verified; see phase 1 evidence.
- [x] T2.1–T2.5 Regression model and controlled sensitivity studies completed; +10% slowdown missed in 0/5 local trials and limitation documented.
- [x] T3.1–T3.4 CLI, GitHub Action summary, local quickstart, and adoption docs completed; hosted CI remains unverified.
- [x] T4.0 Owner supplied three candidate repos; GitHub connection was verified as admin on each. Repo fit is assessed in phase 4 evidence.
- [ ] T4.1–T4.4 Hosted workflows, target traffic, PR comment updates, verdict validation, and owner feedback deferred at the owner's request. Target URLs and a hosted DevFlow API are still needed.
- [x] T5.1 Pre-pilot README and landing-page framing now lead with CI regression checks and disclose pilot status.
- [x] T5.2 CI setup/comparisons are primary in the app navigation and docs; load testing remains available as the supporting workflow.
- [ ] T5.3 True pilot case study deferred until there are real measurements and owner-confirmed outcomes.
- [x] T6.1 Draft future hosted feature split added without prices, launch commitments, or willingness-to-pay claims.
- [x] T6.2 Existing plan/tier fields and admin controls were reused; Settings now explains the account's access tier. No payment integration was added.
- [ ] Phase 5/6 evidence validation and final pricing decisions await the real pilot.

## Security findings

- Untracked pre-existing `demo/` contains a separate Saleor sample application with placeholders and hardcoded sample/test passwords; it remains outside DevFlow and untouched.
- The local owner-created administrator account uses the short password the owner selected earlier. It is hashed in the loopback-only local database and absent from tracked source. Change it before exposing the instance beyond localhost.
- Account-creating test and quickstart fixtures use random passwords. Remaining tracked password literals are the common-password denylist and intentionally weak rejection/hash test inputs.
- Full `npm audit` reported three moderate development dependency findings through `autocannon@8` → `hyperid` → `uuid <11.1.1`. Production-only audit reported zero. The suggested fix forces a breaking `autocannon@9` upgrade and remains a separate review item.

## Decision log

| Decision | Reason |
|---|---|
| Preserve the original Phase 0–5 roadmap files and their historical evidence. | Roadmap2 remains a separate evidence track. |
| Execute pre-pilot Phase 5/6 preparation before external testing at the owner's request. | This changes task order only; no pilot outcomes, accuracy, adoption, or pricing conclusions are fabricated. |
| Keep Phase 4 measurements deferred. | The owner said testing will happen later; the provided repos do not yet include approved deployed target URLs or a reachable hosted DevFlow API. |
| Treat `Buy-or-Wait` as a non-HTTP candidate for now. | Its documented entry point is a batch Python pipeline, not an HTTP service. |
| Keep payment integration out of scope. | The runbook permits a draft and plan stub only; no owner requested real payment processing. |

## BLOCKED / DEFERRED items

- Hosted pilot needs stable owner-approved target URLs reachable by DevFlow workers, a hosted DevFlow API URL, GitHub Actions secrets, and review of exact workflow changes.
- `Buy-or-Wait` requires a deterministic HTTP adapter for this HTTP-focused pilot or replacement with a third HTTP service.
- The pilot log, PR outcome validation, true case study, and pricing interviews cannot be produced before the pilot.

## Known limitations

- Controlled regression measurements came from one Windows host and a loopback fixed-delay endpoint; no real repository pilot has run.
- The landing page and Settings view changes are currently only on this local phase branch. README positioning is already on `main` in commit `95014f9`.
- Full audit findings, live OAuth provider behavior, hosted Action, live PR artifact links, and hosted comment updates remain unverified as described in the phase evidence.
