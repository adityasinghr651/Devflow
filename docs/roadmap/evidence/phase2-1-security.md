# Phase 1 — Security and correctness evidence

Date: 2026-11-11
Branch: `roadmap2/phase-1-security`
Base revision: `f68fae93c21a1826311a481be3c4fbbfe821cce1`
Node: `v22.14.0`
OS: Windows 11 Home Single Language (`10.0.26300`)
CPU: AMD Ryzen 5 5600H with Radeon Graphics
Production dependency audit: `found 0 vulnerabilities`

## T1.1 OAuth email-only takeover payload

Historical reproduction and regression assertion are preserved in `docs/roadmap/evidence/tiered-access.md`. The previous vulnerable implementation returned HTTP 200 and a token for `POST /auth/oauth` with only `{ "provider": "github", "email": "victim@example.com" }`; the test failed with `Expected values to be strictly equal: 200 !== 400`. The current live HTTP integration test sends that payload and receives HTTP 400 without a token. `node --test tests/integration/auth-flows.test.js`: 6 passed, 0 failed. OAuth provider success paths are mocked; real provider credentials were unavailable.

## T1.2 Tenant isolation

Commands:

```text
node --test tests/integration/verification.test.js       # 3 passed, 0 failed
node --test tests/integration/security-regression.test.js # 8 passed, 0 failed
node --test tests/integration/multi-user.test.js         # 1 passed, 0 failed
node --test tests/integration/regression-api.test.js     # 1 passed, 0 failed
node --test tests/integration/phase2-security.test.js    # 1 passed, 0 failed
node --test tests/integration/campaigns-api.test.js      # 1 passed, 0 failed
```

Coverage verifies anonymous requests are rejected, wrong-user access to individual resources is hidden with 404, and owner access succeeds. The API follows collection-route policy by returning each user's own list rather than 404. During the campaign matrix, the wrong-user cancel request initially returned 409. A test was added first; after reproducing the failure, `server/routes/campaigns.js` now checks user-scoped ownership before state, and wrong-user cancel returns 404. The same campaign matrix confirms anonymous requests return 401 and owners can operate on their runs.

## T1.3 Password scan

The checked-in account-creation fixtures and quickstart/regression scripts no longer use fixed strong-password literals. They generate random credentials using `tests/helpers/test-credentials.js` or Node's `randomBytes`. Remaining tracked password strings are intentional: the production common-password denylist, rejected weak-password fixtures, and a direct hash/verify unit-test input. Bootstrap validates `ADMIN_BOOTSTRAP_PASSWORD` through the same `validatePassword()` used by registration and password hashing.

The untracked `demo/` directory contains a separate Saleor sample application with its own test passwords and `changeme` environment placeholders. It was present before this run and was not modified or staged as DevFlow source.

Security exception: this workspace's local administrator account has the short password explicitly selected by the owner in an earlier request. Its password is hashed in the local database, is not present in tracked source, and the API is configured for loopback. This does not meet the application password policy; change it before exposing this local instance beyond localhost. The credential itself is deliberately omitted from this file.

## T1.4 Dependency audit

```text
npm audit --omit=dev
found 0 vulnerabilities
```

## T1.5 and standard verification

`npm run lint` passed (`tsc --noEmit`). `npm run build` passed; Vite transformed 1,689 modules and generated the production assets. `git diff --check` passed.

All 39 unit, integration, and validation test files were run separately: 182 tests, 181 passed, 1 skipped, 0 failed. The skip is the existing `server-restart` child-process signal test, which is unsupported on Windows; the other shutdown/restart checks passed.

The complete `npm test` command ran three times sequentially and exited successfully without termination:

```text
Run 1: # tests 182, # pass 181, # fail 0, # skipped 1, # duration_ms 111132.5217, exit 0
Run 2: # tests 182, # pass 181, # fail 0, # skipped 1, # duration_ms 112187.7864, exit 0
Run 3: # tests 182, # pass 181, # fail 0, # skipped 1, # duration_ms 113209.1527, exit 0
```

No suite process was killed. The full-suite runner exited after each run. No project test process was left running after the last run.

## Gate result and limitations

Phase 1 gate: **PASS WITH DOCUMENTED LOCAL CREDENTIAL EXCEPTION**. The OAuth exploit payload is rejected, the isolation matrix passes, checked-in test account fixtures were randomized, the production dependency audit is clean, and all three full-suite runs passed with the pre-existing Windows-only skip. Real OAuth provider verification and a non-loopback deployment were not tested. The workspace's owner-selected local admin password must be replaced before external exposure.
