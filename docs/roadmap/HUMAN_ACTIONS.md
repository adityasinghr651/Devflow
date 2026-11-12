# Human actions required

The coding agent must not invent legal or account-level decisions. Complete these before publishing broadly:

- [ ] Choose and approve an open-source license; then add the exact license text and update the README license section/badge.
- [ ] Confirm GitHub private vulnerability reporting is enabled in repository settings.
- [ ] Confirm the displayed maintainer/security contact route and response expectations.
- [ ] Review the GitHub Action permissions and configure secrets on the intended repository/environment.
- [ ] Build and run Docker Compose on a Docker-enabled machine; inspect the production environment and ingress configuration.
- [ ] Review repository ownership and release/tag permissions before publishing releases.

## Roadmap2 — regression-gate pilot

- [ ] Supply 3–10 real repositories (owner's projects, friends' projects, or open-source repositories whose owners have agreed) for the Phase 4 pilot.
- [ ] Explicitly approve adding DevFlow's GitHub Action/CLI to those repositories' CI and pointing it at their approved targets. Until both the repository list and approval are supplied, no external pilot will run.
- [ ] Review the three moderate full-audit findings in the development-only `autocannon@8` → `hyperid` → `uuid <11.1.1` dependency chain. npm suggests a forced breaking `autocannon@9` upgrade; production dependencies currently audit clean. Choose whether to schedule that upgrade and its compatibility verification.
- [ ] Change the workspace's owner-selected local administrator password before exposing that local instance beyond `127.0.0.1`.
- [ ] After a real Phase 4 pilot, review the evidence before authorizing README/landing-page repositioning or pricing changes.
