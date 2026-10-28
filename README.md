# ServerTest — Local Performance Engineering MVP

A local-first, open-source starter for registering authorized HTTP targets, running bounded request tests, inspecting measured latency/throughput/error summaries, and exporting run JSON. It adapts the supplied Obsidian Telemetry Engineering Workbench UI into the ServerTest product direction and adds an Express API with local JSON persistence.

> **MVP scope, not production certification:** this version runs a single-process local HTTP load test. It does not yet provide distributed workers, k6 integration, authentication/multi-tenancy, durable relational storage, target CPU/RAM monitoring, live streaming charts, CI/CD integrations, or production-grade job recovery. Do not treat the demo as a public multi-user service.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm

## Run in your IDE

Open the extracted folder in VS Code, WebStorm, or another IDE.

```bash
npm install
```

Open two terminals:

**Terminal 1 — API and test runner**

```bash
npm run server
```

**Terminal 2 — frontend**

```bash
npm run dev
```

Open `http://localhost:3000`. The API listens on `http://127.0.0.1:4000`.

To test locally, run a development API on another port, e.g. `http://localhost:3001`, register it as a target, configure a short test, and explicitly confirm authorization.

## Features implemented

- Responsive workspace UI with light, dark, and system theme choices.
- Dashboard empty states and real target/run counts from the API.
- Target registration and deletion.
- Server-side target URL validation and private/link-local address checks at registration.
- Explicit authorization confirmation before each run.
- Bounded GET/POST/PUT/DELETE/HEAD request tests (concurrency 1–20; duration 1–30 seconds).
- Run status, cancellation, request totals, status-code counts, throughput, p50/p95/p99 latency, and error rate.
- Local JSON persistence in `data/store.json`.
- Results table, evidence-based basic analysis, comparisons, and JSON report export.
- Health endpoint at `GET /api/health`.

## API routes

- `GET /api/health`
- `GET /api/targets`
- `POST /api/targets` — `{ "name": "Local API", "url": "http://localhost:3001", "environment": "Development" }`
- `DELETE /api/targets/:id`
- `GET /api/runs`
- `POST /api/runs` — requires `targetId`, `path`, `method`, `concurrency`, `durationSec`, and `authorized: true`
- `POST /api/runs/:id/cancel`

## Safety notes

- Only test systems you own or have explicit permission to test.
- Tests can impact service health. The UI requires an authorization acknowledgement and the backend caps concurrency and duration.
- Private and link-local IPs are blocked by default. `localhost` is allowed for local development; set `ALLOW_LOCAL_TARGETS=false` to disable it.
- The current implementation performs DNS validation when registering a target, but it is **not a substitute for a hardened production SSRF defense**: DNS rebinding and resolution changes between validation and connection require stronger connection-time enforcement.
- Do not expose this API to the public internet. Authentication, authorization policies, rate limiting, stronger SSRF protection, isolated workers, and persistent database migrations are required before hosted use.
- Target CPU/memory and database metrics are not collected. The UI labels only measurements the worker actually observes.

## Architecture

```text
React + Vite UI
      │ REST
      ▼
Express control API ─── local JSON store
      │
      ▼
Bounded in-process HTTP worker
      │
      ▼
Registered target (HTTP/HTTPS)
      │
      ▼
Observed response codes + request latency → run summary
```

The worker currently runs in the API process. For production, isolate load generation into a separately controlled process and introduce a queue, authenticated ownership, database migrations, robust cancellation/recovery, and k6 or another established load engine incrementally.

## Development commands

- `npm run dev` — frontend dev server
- `npm run server` — backend API
- `npm run build` — TypeScript check and frontend production build
- `npm run preview` — preview built frontend

## License

Starter project derived from the supplied UI workbench. Review dependency licenses and add your preferred repository license before publishing.
