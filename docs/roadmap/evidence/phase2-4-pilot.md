# Phase 4 — Real pilot readiness and status

Date: 2026-11-23
Status: **SELECTED, PILOT DEFERRED / NOT VERIFIED**

## Owner-selected repositories

The owner supplied three repositories. The connected GitHub account (`adityasinghr651`) was verified as an administrator on all three. This established repository access and candidate selection; it did not produce a hosted CI run or performance result.

| Repository | Observed app shape | Pilot fit |
|---|---|---|
| [Room-Allocation-System](https://github.com/adityasinghr651/Room-Allocation-System) | Python / Streamlit web app; README documents port 8501 | Candidate for a small HTTP check against an owner-approved deployed test instance |
| [deeplink-system](https://github.com/adityasinghr651/deeplink-system) | Next.js client plus Express API; server exposes `GET /` on port 5000 | Best direct HTTP fit; needs an owner-approved stable test deployment |
| [Buy-or-Wait](https://github.com/adityasinghr651/Buy-or-Wait) | Python batch pipeline producing `output.csv`; no HTTP service documented | Not directly load-testable by DevFlow without an HTTP wrapper or a different pilot target |

## Why the pilot did not run

The owner asked to finish the remaining preparation first and run the pilot later. No repository workflow was modified or triggered, and no traffic was sent to any external target. The runbook's performance evidence requirements remain open.

Before a hosted Action can run, each selected target needs a stable, owner-approved URL reachable from the DevFlow runner. CI also needs a reachable DevFlow API base URL, a saved target ID and credentials configured as GitHub Actions secrets. Do not store tokens in repository files. The current local DevFlow server binds to loopback and is not reachable from GitHub-hosted runners.

## Deferred pilot measurements

No PR counts, detector verdict validation, false-alarm confirmations, developer retention responses, or willingness-to-pay feedback are available. These remain **NOT VERIFIED**, not zero. Run Phase 4 after the URLs, credentials, and CI change approval are in place. The full pilot must still record Action runs, PR comments, verdict updates, cancellations/timeouts, and owner feedback over an agreed window.
