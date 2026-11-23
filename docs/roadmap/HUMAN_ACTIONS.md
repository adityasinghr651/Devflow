# Human actions required

The coding agent must not invent legal or account-level decisions. Complete these before publishing broadly:

- [ ] Choose and approve an open-source license; then add the exact license text and update the README license section/badge.
- [ ] Confirm GitHub private vulnerability reporting is enabled in repository settings.
- [ ] Confirm the displayed maintainer/security contact route and response expectations.
- [ ] Review the GitHub Action permissions and configure secrets on the intended repository/environment.
- [ ] Build and run Docker Compose on a Docker-enabled machine; inspect the production environment and ingress configuration.
- [ ] Review repository ownership and release/tag permissions before publishing releases.

## Roadmap2 — regression-gate pilot

- [x] Supply candidate repositories: `adityasinghr651/Room-Allocation-System`, `adityasinghr651/deeplink-system`, and `adityasinghr651/Buy-or-Wait`. The connected GitHub account was read-only verified as admin on each.
- [ ] Provide a stable, owner-approved test/staging URL for each HTTP pilot target and the hosted DevFlow API base URL. The local API is loopback-only and cannot serve GitHub-hosted runners.
- [ ] Configure `DEVFLOW_API_URL` and `DEVFLOW_TOKEN` as GitHub Actions secrets in each participating repository; do not put credentials in checked-in files.
- [ ] Review and approve the exact workflow branch/PR changes before enabling the CI pilot. No external workflow has been changed or run yet.
- [ ] Replace `Buy-or-Wait` with another HTTP service or approve designing a deterministic HTTP wrapper; its current README describes a batch Python pipeline, not an HTTP target.
- [ ] Agree on a pilot window and collect PR verdicts, owner-confirmed alarms, developer feedback, and willingness-to-pay responses.
- [ ] Review the three moderate full-audit findings in the development-only `autocannon@8` → `hyperid` → `uuid <11.1.1` dependency chain. npm suggests a forced breaking `autocannon@9` upgrade; production dependencies currently audit clean. Choose whether to schedule that upgrade and its compatibility verification.
- [ ] Change the workspace's owner-selected local administrator password before exposing that local instance beyond `127.0.0.1`.
- [ ] After the Phase 4 pilot, review the evidence and revise the pre-pilot README/landing copy and pricing hypothesis. Do not publish a pilot case study until the results are real and owner-confirmed.
