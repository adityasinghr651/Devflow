# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository (Security → Advisories → Report a vulnerability). Do not file public issues for exploitable vulnerabilities. Include affected versions, impact, reproduction steps, and any suggested mitigation. Maintainers will acknowledge reports and coordinate a fix and disclosure.

## Deployment guidance

Use a unique JWT secret, TLS, restrictive CORS, a private database network, and `ALLOW_LOCAL_TARGETS=false` on public instances. Keep Node and dependencies updated. Never commit credentials or expose an API token to untrusted pull request code.
