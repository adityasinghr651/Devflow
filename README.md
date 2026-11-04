# DevFlow

**A self-hosted web application for running HTTP load tests and reviewing their results.**

DevFlow lets developers exercise an API they own, watch request and latency metrics while a test runs, and keep a history of completed runs. It runs on one machine: a React interface talks to a Node.js API, which starts local worker processes that send requests to the selected HTTP target.

<p align="center">
  <img src="docs/assets/devflow-banner.svg" alt="DevFlow: configure a test, send traffic to an HTTP target, and inspect measured results" width="100%" />
</p>

> **Project scope:** DevFlow currently uses local OS processes on a single host. It is not a multi-machine or cloud-distributed load-testing service. Run tests only against systems you own or are authorized to test.

## Contents

- [What DevFlow does](#what-devflow-does)
- [Why DevFlow](#why-devflow)
- [Screenshots](#screenshots)
- [How a run works](#how-a-run-works)
- [Technology](#technology)
- [Run locally](#run-locally)
- [Run your first local test](#run-your-first-local-test)
- [Test and build](#test-and-build)
- [Project layout](#project-layout)
- [Configuration reference](#configuration-reference)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

## What DevFlow does

- **Configure HTTP workloads.** Choose a registered target, method, path, headers, body, concurrency, duration, and fixed or staged load profile. The API currently limits concurrency to 20 virtual users and fixed duration to 30 seconds.
- **Run locally or with multiple workers.** The Node.js runner supports 1, 2, or 4 child processes on the same machine. It divides the requested virtual users among workers; it does not multiply the requested concurrency.
- **Follow a run live.** Server-Sent Events (SSE) stream progress from the API to the browser while a run is active.
- **Review measured results.** Runs store request totals, status-code counts, throughput (requests per second), error rate, and p50, p95, and p99 latency. Percentiles come from a merged, bounded-memory latency histogram rather than an average of worker percentiles.
- **Keep targets and run history.** PostgreSQL is supported; when `DATABASE_URL` is omitted, the app uses a local JSON file. Demo content in the UI is illustrative and read-only; it is not a real test result.
- **Restrict targets.** Target URLs are validated, local targets can be enabled for development, and non-local targets require ownership verification before a run. Network destinations are checked to block restricted addresses.

Concurrency is the number of virtual users making requests at the same time. Throughput is the number of completed requests per second. A latency percentile describes the response time at or below which that share of completed requests fell: for example, p95 is the 95th-percentile response time.

## Why DevFlow

DevFlow keeps workload setup, execution, live progress, and saved results in one self-hosted workflow. Its controlled local target makes it possible to exercise the runner against predictable endpoints before pointing it at an authorized service.

## Screenshots

The checked-in `docs/assets/devflow-ui-preview.jpg` is concept artwork for a landing page, not a capture of the running application, so it is intentionally not presented as a product screenshot here.

To add an accurate screenshot, start the API and Vite app using the instructions below, sign in with a local account, and capture the real Targets, Run configuration, Live Metrics, and Run Details screens. Use a local test target, remove personal data from the image, and save the captures under `docs/assets/` before linking them here.

## How a run works

The diagram shows the implemented Node.js runner flow. All components run on the same host. PostgreSQL and JSON file storage are alternatives; the API selects PostgreSQL when `DATABASE_URL` is set.

![DevFlow system design: browser, API, runner, workers, target, telemetry, and persistence](docs/assets/devflow-system.svg)

1. The browser sends an authenticated request to create a run. The API checks the user's target and workload settings, then stores the queued run.
2. The runner manager starts a coordinator. The coordinator partitions the workload and forks 1, 2, or 4 Node.js worker processes.
3. Workers send HTTP requests to the target and send cumulative progress snapshots to the coordinator over IPC.
4. The coordinator combines progress and histogram data, saves run updates through the storage layer, and emits events consumed by the API's SSE endpoint.
5. The browser displays live progress and loads the saved result when the run reaches a terminal state.

```mermaid
sequenceDiagram
    actor User
    participant UI as React app
    participant API as Express API
    participant Store as PostgreSQL or JSON file
    participant Runner as Runner manager and coordinator
    participant Worker as Node child worker(s)
    participant Target as HTTP target

    User->>UI: Configure test and confirm authorization
    UI->>API: POST /api/runs (JWT)
    API->>Store: Save queued run
    API->>Runner: Enqueue run
    Runner->>Worker: Fork and partition workload
    Worker->>Target: Send HTTP requests
    Target-->>Worker: HTTP responses
    Worker-->>Runner: IPC progress and histogram summaries
    Runner->>Store: Persist progress and final result
    Runner-->>API: Progress and status events
    API-->>UI: SSE progress, completion, or error
    UI->>API: GET /api/runs/:id after completion
    API->>Store: Read saved run
    Store-->>UI: Run history and metrics
```

`workerCount` selects local child-process workers; it does not distribute work to other machines. An optional k6 adapter is also present in the code. It is selected only when k6 is available or explicitly configured, and it handles fixed-profile, single-worker runs; the Node.js runner is the default path for staged or multi-worker runs.

## Technology

| Technology | Used for | Why it is here |
| --- | --- | --- |
| Node.js (ES modules) | API, runner, test target, and scripts | One JavaScript runtime for the server and local workers |
| Express 4 | HTTP API | Routes for health, authentication, targets, and runs |
| React 19 and TypeScript | Browser interface | Interactive screens and typed UI data |
| Vite 8 | Frontend development and production build | Local dev server and static asset bundling |
| PostgreSQL (`pg`) | Optional persistent database | Relational storage with versioned SQL migrations |
| Local JSON storage | Default when no database URL is configured | Persistent single-machine development without PostgreSQL |
| Node.js `child_process` and IPC | Local load generation | Runs worker event loops separately from the API process |
| Server-Sent Events | Live run updates | Streams progress to the open browser connection |
| Node.js test runner | Unit and integration tests | Runs the repository's JavaScript tests without a separate test framework |
| k6 (optional executable) | Optional fixed, single-worker run engine | Allows the adapter to invoke an installed k6 binary |

## Run locally

### Prerequisites

- Node.js **20.19+** or **22.12+** (Vite's supported runtime range).
- npm, which is used with the checked-in `package-lock.json`.
- PostgreSQL only if you want database-backed storage. Otherwise, DevFlow writes to a local JSON file.
- A modern browser.

### Clone and install

```bash
git clone https://github.com/adityasinghr651/Devflow.git
cd Devflow
npm ci
```

### Configure the environment

Copy the example configuration:

```bash
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` if `cp` is unavailable.

For local development, the checked-in example enables local targets and leaves `DATABASE_URL` commented out. Replace the sample `JWT_SECRET` with a private random value if you will use the instance beyond a throwaway local session. The example value is not a production secret.

### Choose a storage backend

**JSON file (default):** Leave `DATABASE_URL` unset. Data is written to `DATA_DIR/store.json`; by default `DATA_DIR` is `./data` relative to the project environment file. The `data/` directory is ignored by Git.

**PostgreSQL (optional):** Install and start PostgreSQL, create an empty database such as `devflow`, then set `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgresql://devflow_user:replace-this-password@127.0.0.1:5432/devflow
```

Create the database and role with your PostgreSQL administration tool or `psql`. The API applies the checked-in SQL migrations at startup. If `DATABASE_URL` is set but the database cannot be reached or migrations fail, the API exits; it does not silently switch to JSON storage. Do not commit `.env` or real credentials.

### Start the API and UI

Run each command from the repository root in a separate terminal:

**Terminal 1 — API:**

```bash
npm run server
```

The API listens on `http://127.0.0.1:4000` by default.

**Terminal 2 — frontend:**

```bash
npm run dev
```

Open <http://localhost:3000>. Register an account or sign in. The demo workspace is read-only and cannot create targets or start real tests.

**Terminal 3 — controlled local target (for the tutorial below):**

```bash
npm run target
```

The helper binds to `127.0.0.1:5050`. It provides predictable endpoints for safe local tests.

### Verify the setup

- Open <http://127.0.0.1:4000/api/health>. A healthy response has `"status":"ok"`. Its `storage` field is `postgresql` or `local-json`; `persistence` is `database` or `local-file`.
- Open <http://127.0.0.1:5050/health> after starting the target helper. It should return JSON with `"status":"ok"`.
- Open <http://localhost:3000> and sign in. The API and target helper do not serve the React UI.

The API uses `API_PORT` (default `4000`), not `PORT`. The frontend uses `VITE_API_URL` (default `http://localhost:4000/api`). If you change either endpoint, keep the frontend URL, API CORS origin, and actual listening ports aligned.

## Run your first local test

Only load-test systems you own or have explicit permission to test. This walkthrough uses DevFlow's controlled server on loopback.

1. Start the API, UI, and controlled target in three terminals as shown above.
2. Open <http://localhost:3000>, then register an account or sign in.
3. Open **Targets** and add a target named `Local test target` with URL `http://127.0.0.1:5050`. With `ALLOW_LOCAL_TARGETS=true`, local targets are accepted and marked verified for development.
4. Open **Run Test**. Select `Local test target`, set the path to `/slow?ms=50`, choose `GET`, then use the quick preset or set concurrency to `5` and duration to `5` seconds. Confirm the authorization prompt and launch the test.
5. Open **Live Metrics** to watch progress, throughput, and latency while the request workers are active.
6. When the run completes, open its details from the run list or overview. Review total requests, response status codes, error rate, and p50/p95/p99 latency. The controlled endpoint waits approximately 50 ms before replying.
7. Refresh the page and sign in again if needed. The saved run should remain in run history when using the same configured storage backend.

The controlled server also implements `GET /health`, `GET /status/:code`, `GET /mixed`, `POST /echo`, and `GET /large?kb=64`. These endpoints are defined in [`tools/test-target.js`](tools/test-target.js); request limits are enforced by that helper.

## Test and build

The repository uses Node's built-in test runner. `npm test` runs files under `tests/`; the suite includes unit tests and integration tests for API workflows, storage, workers, cancellation, SSE, security, and metric aggregation.

```bash
# Full unit and integration suite
npm test

# TypeScript type check (the repository's lint script)
npm run lint

# Production frontend build (includes the type check)
npm run build

# Focused bounded-memory latency histogram tests
node --test tests/unit/latency-histogram.test.js

# API workflow integration test (register through saved test results)
node --test tests/integration/e2e-workflow.test.js

# Real worker and telemetry integration test against an ephemeral local HTTP fixture
node --test tests/integration/real-run-telemetry.test.js

# Controlled throughput benchmark; starts its own 127.0.0.1 target
npm run bench:ci
```

The telemetry integration test starts a local fixture that delays responses, runs a Node worker, and checks that the measured request count and latency reflect the fixture, then reads results from a fresh JSON storage instance. It does not test the browser UI. There is no dedicated frontend component test command in `package.json`.

The API workflow integration test covers registration, target creation, test execution, and saved result retrieval. GitHub Actions is configured in `.github/workflows/performance-benchmark.yml`; it runs `npm test` and the controlled benchmark and comparison scripts.

`npm run bench:ci` is a benchmark command rather than a unit test; run it on an otherwise idle machine and interpret its output as a local measurement. The optional [`node tools/live-smoke-test.js`](tools/live-smoke-test.js) exercises the live API and several long-running workloads. It requires the API and target helper to be running, creates a test account and target in the configured store, and should be used with disposable local data.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| API exits during startup | Check database availability and `DATABASE_URL`. If set, PostgreSQL must accept the connection and migrations must succeed. |
| Health route reports `local-json` | `DATABASE_URL` is not set in the API process. Check which `.env` file the process is using; never paste its secret values into an issue. |
| Browser cannot reach the API | Confirm the API is listening on `API_HOST`/`API_PORT`, `VITE_API_URL` points to it, and `CORS_ORIGIN` matches the UI origin. Restart Vite after changing `.env`. |
| Local target cannot be added | Start `npm run target`, check `http://127.0.0.1:5050/health`, and confirm `ALLOW_LOCAL_TARGETS=true`. |
| PostgreSQL integration test skips | The test uses `TEST_DATABASE_URL` when provided, otherwise its own local test connection default. Start/configure an isolated test database; do not point it at production data. |
| Port is already in use | Stop the process using that port or configure `API_PORT` / `TARGET_PORT`. The frontend's Vite port is configured in `vite.config.ts` (3000). |

## Project layout

| Path | Contents |
| --- | --- |
| `src/` | React application, views, forms, and styles |
| `server/routes/` | Health, auth, target, and run API routes |
| `server/runner/` | Queue manager, coordinator, child worker, metrics, and optional k6 adapter |
| `server/storage/` | JSON and PostgreSQL storage implementations and SQL migrations |
| `server/security/` | Target validation, ownership verification, authentication, and network checks |
| `tools/test-target.js` | Controlled local HTTP target for development and tests |
| `tools/` | Benchmark, comparison, and smoke-test scripts |
| `tests/unit/` | Unit tests for validation, security, workload partitioning, and metrics |
| `tests/integration/` | API, storage, worker, SSE, reliability, and telemetry integration tests |
| `docs/` | Metrics contract, roadmap evidence, and documentation assets |

## Configuration reference

All variables are optional for local startup unless noted. Values below match `.env.example` and the server configuration; if a default is set by the application it is listed.

| Variable | Purpose | Default / example | Required? |
| --- | --- | --- | --- |
| `API_HOST` | Address bound by the API | `127.0.0.1` | No |
| `API_PORT` | API port | `4000` | No |
| `CORS_ORIGIN` | Allowed browser origin | `http://localhost:3000` | No |
| `VITE_API_URL` | Frontend API base URL | `http://localhost:4000/api` in `.env.example` | No |
| `ALLOW_LOCAL_TARGETS` | Permit loopback targets for development | `true` in `.env.example`; otherwise enabled unless set to `false` | No |
| `JWT_SECRET` | Signs and verifies auth tokens | Development fallback in code; **required in production** | Production only |
| `JWT_EXPIRES_IN` | Token lifetime accepted by `jsonwebtoken` | `24h` | No |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth rate-limit window in milliseconds | `60000` | No |
| `AUTH_RATE_LIMIT_MAX` | Auth requests allowed per window and IP | `10` | No |
| `DATABASE_URL` | PostgreSQL connection string; enables PostgreSQL storage and startup migrations | Unset (JSON storage) | No |
| `DB_POOL_MIN` | PostgreSQL pool minimum | `2` | No |
| `DB_POOL_MAX` | PostgreSQL pool maximum | `10` | No |
| `DATA_DIR` | Directory containing `store.json` when JSON storage is used | `./data` relative to `.env` | No |
| `MAX_ACTIVE_RUNS` | Concurrent runs managed by this API process | `1` | No |
| `REQUEST_TIMEOUT_MS` | Per-request timeout default for the Node runner | `5000` | No |
| `RUNNER_ENGINE` | Runner selection (`auto`, `node`, or `k6`) | `auto` | No |
| `K6_BIN` | k6 executable name or path when using the adapter | `k6` | Only for k6 |
| `NODE_ENV` | Enables production configuration checks when set to `production` | Unset | No |
| `TARGET_PORT` | Port for the controlled local target helper | `5050` (or first CLI argument) | No |

## Contributing

Issues and focused pull requests are welcome. Start with a small bug fix, a test that covers a missing edge case, clearer documentation, or an improvement to the controlled target or metrics views. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the local workflow and pull-request checklist.

## Roadmap

See [`docs/roadmap/PROGRESS.md`](docs/roadmap/PROGRESS.md) for the recorded roadmap phase status and evidence. Planned work is not described here as implemented functionality.

The statistical comparison behavior and its noise thresholds are described in [`docs/REGRESSION_DETECTION.md`](docs/REGRESSION_DETECTION.md).

## License

There is currently no `LICENSE` file in this repository. Until a license is added by the project owner, the repository's reuse and contribution terms are unspecified. Please do not assume an open-source license from the code or README wording.
