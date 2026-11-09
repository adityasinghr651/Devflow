# Tiered access verification evidence

## OAuth takeover reproduction

Before the fix, `node --test tests/integration/auth-flows.test.js` produced `Expected values to be strictly equal: 200 !== 400` for a registered victim followed by `POST /auth/oauth` with only `{ "provider": "github", "email": "victim@example.com" }`. The server returned HTTP 200 and a token. After the fix, the regression test expects HTTP 400 and verifies no token is returned.

The previous target-verification workflow was rerun before changes with `node --test tests/integration/verification.test.js`: 3 passed, 0 failed. It did not reproduce the claimed ownership failure. Added coverage checks owner=200, non-owner=404, and unauthenticated=401. The final verification run still passes all 3 cases.

## Isolation matrix

| Route | Anonymous | Wrong user | Owner | Pro | Admin |
|---|---:|---:|---:|---:|---:|
| `GET /targets` | 401 | 200 (own list only) | 200 | 200 | 200 (own list only) |
| `POST /targets/:id/verify` | 401 | 404 | 200 or 400 for failed external proof | 200 or 400 | 200 or 400 |
| `GET /runs/:id` | 401 | 404 | 200 | 200 | 200 (own record) |
| `POST /runs/:id/cancel` | 401 | 404 | 200 while active | 200 while active | 200 while active |
| `DELETE /runs/:id` | 401 | 404 if absent/out of scope | 403 | 200 for own finished run | 200 for any finished run |
| `GET /campaigns/:id` | 401 | 404 when both paid | 403 for Free | 200 (owned) | 200 (owned) |
| `GET /admin/stats`, `/admin/users` | 401 | 403 | 403 | 403 | 200 |
| `DELETE /admin/runs/:id` | 401 | 403 | 403 | 403 | 200 for finished run |

Status entries above describe the route policy exercised by `tests/integration/auth-flows.test.js`, `tests/integration/verification.test.js`, `tests/integration/regression-api.test.js`, and `tests/integration/phase2-security.test.js`. OAuth success paths use mocked GitHub and Google identity responses; email-only requests are exercised through the real HTTP route and return 400 without issuing a token.

## Final verification results

- Each of the 39 `tests/**/*.test.js` files passed individually: 182 tests, 181 passed, 1 skipped, 0 failed. The skip is the SIGTERM child-process check, which is explicitly unsupported on Windows; the direct shutdown test covers the manager behavior.
- Full `npm test` suite passed twice: each run reported 182 tests, 181 passed, 1 skipped, 0 failed.
- `npm run lint` passed (`tsc --noEmit`). `npm run build` passed (TypeScript and Vite production build).
- `git diff --check` passed. The credential-pattern scan found no production default login/password. It did find the deliberate rejected-password fixture in `server/security/auth.js`, test-only credentials, and `changeme` placeholders in the unrelated nested demo application samples.
- Added tiering behavior tests cover the 10-run demo and IP limit, 15-run Free limit, paid quota and deletion behavior, admin access, and stale-token demotion. Storage tests check concurrent atomic Free quota reservations.

## Manual walkthrough

Not manually completed against a running browser/PostgreSQL deployment in this workspace. Automated tests use JSON storage and an owned local target, plus the PostgreSQL adapter integration test. Test coverage exercises quota boundary states using persisted usage counters. An actual browser OAuth login and real one-day demo expiry need configured provider credentials and elapsed time respectively.

## Limits and required configuration

- No real OAuth provider credentials were available; provider token and identity endpoints are mocked in integration tests.
- No payment processor is configured; Pro promotion is administrator controlled.
- PostgreSQL schema and adapter behavior are exercised by the project's migration and PostgreSQL adapter integration tests; an external deployment was not available for manual verification.
