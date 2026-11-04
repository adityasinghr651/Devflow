# Security model

## Assets and trust boundaries

- User accounts, bearer credentials, target URLs, request headers/bodies, run results, and audit events are sensitive.
- Load generation crosses from the DevFlow control plane to a user-authorized target. Target registration and every worker execution validate the destination.
- JSON files are suitable for local single-user use. Shared deployments should use PostgreSQL and protect its volume, connection string, and backups.

## Controls

- Production startup requires a non-default JWT secret of at least 32 characters. Production disables localhost targets by default.
- CORS uses explicit origins from `CORS_ORIGINS` (comma separated); production rejects `*`. JSON requests are capped at 64 KiB. Security headers include content-type sniffing protection and frame denial.
- Register, login, and OAuth endpoints use an in-memory per-IP sliding-window limiter. It is process-local and does not coordinate across replicas.
- Passwords are hashed with bcrypt; password length is 8–128 characters. Login failures use the same response for unknown accounts and bad passwords. Duplicate registration uses a generic error body.
- Targets, runs, cancellation, stream tickets, and audit events are user-scoped. SSE uses a single-use 256-bit ticket that expires in 30 seconds instead of a long-lived JWT in the URL.
- Sensitive request header names are redacted before run persistence and API/export/report output. The worker receives the raw values over local IPC for execution; therefore storage backups and worker process access remain trusted security boundaries.
- URL validation rejects credentials, local/private/link-local/metadata destinations by default, resolves hostnames, rejects private DNS answers, blocks redirects, and repeats destination validation in the worker before load starts. DNS resolution is injectable for deterministic SSRF tests.
- Per-user quotas limit active runs, run count over 24 hours, and estimated VU-seconds over 24 hours. Denials return 429 with `Retry-After` and create an audit event.
- PostgreSQL stores audit events in `audit_events`; JSON storage preserves equivalent events. Users can query only their own audit events.
- CI runs `npm audit --omit=dev --audit-level=high`; Dependabot checks npm and GitHub Actions weekly.

## Known limits

- The rate limiter and SSE ticket map are in-memory; run one API process or add shared coordination before horizontal scaling.
- DNS validation has a time-of-check/time-of-use boundary between DNS lookup and TCP connection. Worker revalidation narrows this window but does not pin resolved addresses into the transport connection.
- Raw configured header values must be retained while a run executes. Anyone with storage or worker process access can access them; users should not supply credentials they cannot safely expose to that host.
- Audit event writes are best effort in PostgreSQL and local JSON data is not encrypted at rest by the application.
- The test suite validates controlled loopback fixtures; it does not replace a deployment-specific network egress policy, TLS termination, secret manager, or database backup plan.
