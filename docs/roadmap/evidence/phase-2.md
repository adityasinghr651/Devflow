# Phase 2 Evidence — Safety and security

Branch: `roadmap/phase-2-security`  
Base commit: `7c0072f` (Phase 1)  
Gate status: PASS, 2026-11-04

## T2.1–T2.9 implementation evidence

- Production config rejects missing/default/short JWT secrets and wildcard CORS, disables local targets by default, and parses explicit origin allowlists. JSON is limited to 64 KiB; security headers and origin checks are implemented without a new middleware dependency.
- Register/login/OAuth use the existing in-memory sliding-window limiter; password length is 8–128; login errors are generic; expired JWT rejection is covered by `tests/unit/auth.test.js`.
- Resource handlers scope lookups to the authenticated user. SSE now exchanges authenticated POST for a scoped, single-use 30-second ticket; legacy query JWTs are rejected. Integration coverage verifies cross-user access denial and ticket replay/ownership.
- Sensitive headers are redacted from stored/report values, including proxy authorization and names containing token/secret/key/password. Raw execution values are held temporarily in process memory and sent to the worker; see `docs/SECURITY_MODEL.md`.
- SSRF checks cover numeric IPv4 encodings, trailing-dot localhost, IPv6 and mapped addresses, metadata/link-local, credentials, injectable DNS, private DNS, rebinding recheck, and redirect blocking in worker tests.
- Configurable active-run, daily-run, and VU-seconds quotas return 429 with `Retry-After`; integration tests exercise each denial. Audit events are persisted in JSON and Postgres and user reads are scoped. Login success/failure, target lifecycle/verification, run creation/cancel/finish, and quota denials are audited.
- Validation rejects oversized JSON, malformed input, reserved prototype keys, CRLF injection, invalid/transport-controlled headers, and out-of-bound run values.
- CI includes `npm audit --omit=dev --audit-level=high`; Dependabot is configured. `npm audit --omit=dev`: `found 0 vulnerabilities`.

## Verification output

Commands run in the isolated Phase 2 worktree:

```text
npm run lint                         PASS (tsc --noEmit)
npm run build                        PASS (vite build)
npm audit --omit=dev                 found 0 vulnerabilities
node --test [targeted security files] 23 passed, 0 failed
all 30 unit/integration test files separately PASS
npm test (pass 1)                    137 passed, 0 failed
npm test (pass 2)                    137 passed, 0 failed
npm test (pass 3)                    137 passed, 0 failed
```

All network test targets were loopback fixtures. No external load was generated. Process cleanup is covered by existing cancellation/reliability tests; Windows has no `pgrep`, so the exact Linux process check is not applicable. One non-failing JSON-storage ENOENT diagnostic appeared in a coordinator cancellation cleanup during pass 2; the suite completed successfully and the isolated per-file sweep and other two full passes were clean. This remains a cleanup race to monitor, not a suppressed test failure.

## Known operational limits

- Authentication limiter and SSE tickets are process-local; multi-instance deployments need shared storage or sticky routing.
- DNS is checked before execution but the HTTP stack performs a later lookup, leaving a DNS time-of-check/time-of-use window.
- Raw configured request headers exist in process memory and worker IPC while the test runs; reports and persistent records contain redacted values.
- Audit events for unknown-email login failures have no user ID and therefore do not appear in any user's own-event list.
