# API reference

The preferred base path is `/api/v1`. The compatibility prefix `/api` is deprecated and returns `Deprecation: true` with a sunset date of 2027-11-04. OpenAPI contract: [openapi.yaml](openapi.yaml).

Unauthenticated: `GET /health`, `GET /ready`, `POST /auth/register`, `POST /auth/login`. Authenticated routes use `Authorization: Bearer <JWT>`: `GET /auth/me`, `POST /auth/logout`, `POST /auth/oauth`, `GET /audit-events`; targets use `GET|POST /targets`, `POST /targets/{id}/verify`, `DELETE /targets/{id}`; runs use `GET|POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/regression` (same-target statistical comparison with baseline explanation), `POST /runs/{id}/cancel`, `POST /runs/{id}/events-ticket`, and `GET /runs/{id}/events` (SSE, bearer or single-use ticket).

POST run returns `202` with the created record. Poll `GET /runs/{id}` or open its events stream for progress. Errors are JSON with an `error` message; quota errors return `429` and `Retry-After`. Tenant reads are owner-scoped.
