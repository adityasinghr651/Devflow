<div align="center">

  <img src="docs/assets/devflow-banner.svg" alt="DevFlow: API Performance Regression Checks" width="100%" />

  <br />
  <br />

  [![CI Build](https://img.shields.io/badge/CI-Passing-10B981?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/adityasinghr651/Devflow/actions)
  [![Node Runtime](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![React & Vite](https://img.shields.io/badge/React_19-Vite_8-61DAFB?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![PostgreSQL](https://img.shields.io/badge/Storage-PostgreSQL_|_JSON-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-C6F432?style=for-the-badge&logo=git&logoColor=0B0B0C)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-C6F432?style=for-the-badge&logo=git&logoColor=0B0B0C)](CONTRIBUTING.md)

  <p align="center">
    <strong>An open-source HTTP performance regression gate &amp; load-testing platform.</strong><br />
    Run repeatable API workloads, stream real-time bounded-memory telemetry via Server-Sent Events, compare performance against historical baselines, and surface latency regressions on pull requests before deployment.
  </p>

  <p align="center">
    <a href="#quickstart-local-setup">Quickstart</a> •
    <a href="#using-devflow-in-the-web-ui">Using the Web UI</a> •
    <a href="#catch-performance-regressions-in-ci">CI &amp; CLI Checks</a> •
    <a href="#ui-design--live-telemetry">UI &amp; Visual Tour</a> •
    <a href="#api-testing-walkthrough">Testing Walkthrough</a> •
    <a href="#supabase--database-setup">Supabase &amp; Database</a> •
    <a href="#self-hosted-production-deployment">Production Deployment</a> •
    <a href="#how-devflow-works">Architecture</a> •
    <a href="#rest-api-reference">REST API</a> •
    <a href="#configuration-reference">Configuration</a>
  </p>

</div>

---

> [!NOTE]
> **Project Scope:** DevFlow is an open-source, self-hosted API performance platform and CI performance regression gate. Its browser UI, isolated workers, saved run history, CLI (`devflow check`), and GitHub Action work together to run repeatable workloads and compare them against historical baselines. External repository pilots are in progress; current detector evidence comes from controlled local workloads. Run tests only against systems you own or are explicitly authorized to assess.

---

## Highlights & Engineering Principles

```text
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  ⚡ Bounded-Memory Histograms │ Exact O(1) memory across 6,801 buckets      │
  │  🔄 Zero-Polling Telemetry     │ Out-of-process Node workers push live SSE  │
  │  🛡️ Cryptographic Verification│ DNS TXT & HTTP challenge proofs block SSRF │
  │  🔀 Multi-Worker Isolation     │ Partitioned concurrency across CPU cores   │
  │  📈 CI Regression Checks        │ Compare API runs against matching history │
  │  💾 Dual Storage Engine        │ Zero-config JSON or PostgreSQL persistence │
  └─────────────────────────────────────────────────────────────────────────────┘
```

- **Sub-Millisecond Bounded Histograms:** Percentiles (p50, p90, p95, p99) are computed from exact nearest-rank buckets spanning 0.1 ms to 60,000 ms with fixed $O(1)$ memory guarantees—never by taking an inaccurate average of percentiles.
- **Real-Time Zero-Polling SSE Stream:** The backend runner coordinator broadcasts cumulative progress, throughput, and latency to open browser connections via Server-Sent Events (SSE).
- **Process Isolation:** Dedicated Node.js worker child processes run load generation loops, preventing benchmark traffic from starving the API server or distorting measurements.
- **Safety by Design:** Target endpoints require verification before remote testing. Production disables loopback targets by default; keep the runner restricted to authorized systems.
- **Unified 1-Command Startup:** Launch the API, Vite React frontend, and local controlled test target together with `npm run dev:all`.

---

## UI Design & Live Telemetry

DevFlow includes a modern developer dashboard built on a high-contrast palette of **Midnight Black (`#0B0B0C`)**, **Pure White (`#FFFFFF`)**, and **Electric Lime (`#C6F432`)**.

### 1. Workspace Dashboard & Onboarding Checklist

The workspace guides you through saving an authorized API target, running initial benchmark tests, and collecting comparable history:

<p align="center">
  <img src="docs/assets/devflow-workspace-preview.png" alt="DevFlow Workspace Dashboard and Onboarding Checklist" width="100%" />
</p>

### 2. Live Telemetry & SSE Stream

The telemetry dashboard displays real-time execution metrics against a target, streaming throughput (RPS), status code breakdown, live progress bar, and bounded latency percentiles:

<p align="center">
  <img src="docs/assets/devflow-api-testing-live.svg" alt="DevFlow Live API Load Test Execution and SSE Telemetry Stream" width="100%" />
</p>

### 3. In-App Step-by-Step Guide & Supabase Sign-In

The in-app documentation provides complete workflows directly inside the application. The authentication interface supports native credentials and Supabase Auth:

<p align="center">
  <img src="docs/assets/devflow-guide-preview.png" alt="DevFlow In-App Step-by-Step Guide and Documentation" width="100%" />
</p>

<p align="center">
  <img src="docs/assets/devflow-auth-preview.png" alt="DevFlow Authentication Interface with Supabase Identity" width="70%" />
</p>

---

## Using DevFlow in the Web UI

DevFlow is self-hosted software. Open `http://localhost:3000` (or your deployed domain URL) to use the web application:

### 1. Sign In or 1-Click Instant Demo
- **Try Demo:** Click **Try Demo** on the landing page for an instant 24-hour temporary session (no registration required, limited to 10 runs, 2 Virtual Users, 10s max duration).
- **Registered Account:** Register with an email and strong password (min 10 characters) for persistent history and higher concurrency limits. When Supabase Auth is enabled, identities are authenticated through Supabase while DevFlow manages local roles, quotas, and permissions.

### 2. Register API Target & SSRF Domain Verification
To prevent Server-Side Request Forgery (SSRF) and protect unauthorized endpoints, remote targets require proof of domain ownership:
1. Go to **API Targets** (`/targets`) → Click **+ Add API Target**.
2. Enter the target name, service root URL (e.g. `https://api.staging.example.com`), and environment.
3. Local loopback addresses (`127.0.0.1`, `localhost`) are automatically verified in local development mode.
4. For remote endpoints, click **Verify Target** and choose a verification method:
   - **DNS TXT Record:** Add a TXT record `devflow-verification=<token>` at `_devflow.<your-domain.com>`.
   - **HTTP Challenge:** Host a static file at `https://<your-domain.com>/.well-known/devflow-challenge.txt` containing the verification token.
5. Click **Confirm Verification** to unlock the target for testing.

### 3. Configure & Launch a Test Run
1. Go to **Test Runs** (`/runs`) → Click **Run Test +**.
2. Select your verified target, endpoint path (e.g. `/v1/orders`), and HTTP method (`GET`, `POST`, `PUT`, `DELETE`).
3. Set Virtual Users (concurrency), Duration (seconds), Worker count, and optional headers or payload.
4. (Optional) Set assertions for latency thresholds (e.g. `p95 < 120ms`) or status codes (`status == 200`).
5. Confirm target authorization and click **Launch Test**.

### 4. Monitor Live Telemetry in Real Time
1. The app navigates to **Live Metrics** (`/live`).
2. Watch live throughput gauges, status code distribution (2xx, 4xx, 5xx), and real-time latency percentiles (p50, p90, p95, p99) streaming over SSE.
3. Click **Stop Execution** anytime to gracefully abort.

### 5. Analyze Results & Compare Runs
1. Review past executions in **Test Runs** or **History**.
2. Inspect the 6,801-bucket latency distribution curve and environment metadata.
3. Use **Comparisons** (`/comparisons`) to select two completed runs against the same endpoint and evaluate performance deltas.
4. Click **Export Report (JSON)** to download the audit report.

---

## Catch Performance Regressions in CI

DevFlow runs repeatable HTTP benchmarks during pull request review, comparing results against recent comparable runs to catch performance regressions before merging.

### How a CI Check Flows

```text
Pull request → GitHub Actions → `devflow check` → DevFlow API
                                      │                 ├─ runs the configured HTTP workload
                                      │                 ├─ saves run results & compares history
                                      └─ PR summary ←───┴─ returns pass, regression, or insufficient data
```

The CI check uses DevFlow's internal runner and history. A first run may return `insufficient_data`; DevFlow requires at least three comparable completed runs before making a statistical comparison. The GitHub Action uploads the report and posts a summary comment on the pull request.

### CLI One-Command Project Check

1. Link the CLI globally:
   ```bash
   npm link
   ```

2. Initialize a starter configuration in your repository:
   ```bash
   devflow check --init
   ```
   This creates `devflow.config.json` in the repository where you run the command. Set `targetId` to your saved DevFlow target.

3. Export your authentication token and run the check:
   ```powershell
   # Windows PowerShell
   $env:DEVFLOW_TOKEN = "<your-token>"
   devflow check
   ```

   ```bash
   # Linux / macOS
   export DEVFLOW_TOKEN="<your-token>"
   devflow check
   ```

### GitHub Actions Workflow Example

```yaml
name: Performance Regression Check
on:
  pull_request:
    branches: [main]

jobs:
  devflow-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run DevFlow CI Check
        env:
          DEVFLOW_TOKEN: ${{ secrets.DEVFLOW_TOKEN }}
          DEVFLOW_API: ${{ secrets.DEVFLOW_API_URL }}
        run: |
          npx devflow check --json
```

See [docs/CLI.md](docs/CLI.md), [examples/github-action-quickstart.yml](examples/github-action-quickstart.yml), and [docs/REGRESSION_DETECTION.md](docs/REGRESSION_DETECTION.md) for full policy details.

---

## Quickstart: Local Setup

### Prerequisites

- **Node.js**: `22.x` (see `package.json` engines)
- **npm**: `10+`
- **PostgreSQL** *(optional)*: Local JSON storage is used by default with zero configuration.

### 1. Clone & Install

```bash
git clone https://github.com/adityasinghr651/Devflow.git
cd Devflow
npm ci
```

### 2. Configure Environment

```bash
# Linux / macOS:
cp .env.example .env

# Windows PowerShell:
Copy-Item .env.example .env
```

### 3. Launch All Services

Launch the Web UI, REST API, and controlled test target with one command:

```bash
npm run dev:all
```

| Service | Port | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Web UI** | `3000` / `3001` | `http://localhost:3000` | React 19 + Vite dashboard |
| **Express API** | `4000` | `http://127.0.0.1:4000/api` | REST API &amp; SSE event broadcaster |
| **Test Target** | `5050` | `http://127.0.0.1:5050` | Mock server with predictable latency &amp; status endpoints |

*(Press `Ctrl+C` to stop all running services).*

---

## API Testing Walkthrough

DevFlow includes a controlled loopback target helper (`tools/test-target.js`) that responds with deterministic latency for safe, predictable verification:

| Endpoint | Purpose | Expected Behavior |
| :--- | :--- | :--- |
| **`GET /slow?ms=50`** | Controlled Delay | Injects exact 50ms delay. In **Live Metrics**, verify `p95` measures **`50–53 ms`**. |
| **`GET /health`** | Fast Baseline | Instant 200 OK. Tests maximum throughput and sub-millisecond response. |
| **`GET /status/500`** | Server Failure | Returns HTTP 500. UI indicates **100% Error Rate** and categorizes 5xx errors. |
| **`GET /mixed`** | Mixed Responses | Alternates between 200 OK and 500 error (**50% Error Rate**). |
| **`GET /flaky?everyN=5`** | Deterministic Failure | Every 5th request returns 500 (**20% Error Rate**). |
| **`GET /big?bytes=65536`** | Payload Stress | Transmits 64 KB binary octet-stream for payload throughput verification. |
| **`GET /hang`** | Client Timeouts | Holds connection open until client `timeoutMs` triggers timeout error. |

### Step-by-Step Test Walkthrough

1. Start all services: `npm run dev:all`.
2. Open `http://localhost:3000` and click **Try Demo**.
3. In **API Targets**, confirm `Local test target` (`http://127.0.0.1:5050`) is present.
4. Click **Run Test** and configure:
   - **Target:** `Local test target`
   - **Path:** `/slow?ms=50`
   - **Concurrency:** `5 Virtual Users`
   - **Duration:** `5 seconds`
   - **Worker Count:** `1 worker`
5. Click **Launch Test** and watch real-time metrics stream on **Live Metrics**.
6. Review final metrics: `p95` latency measures `~50–53 ms`, reflecting true endpoint latency.

---

## 1M Request Benchmark Campaign

Benchmark Campaigns run four quota-based tests through DevFlow's worker coordinator: **250,000**, **500,000**, **750,000**, then **1,000,000** measured requests. Every stage receives a new run ID and fresh worker processes.

### Run an Opt-in Local Campaign

```powershell
$env:DEVFLOW_EMAIL = "your-account@example.com"
$env:DEVFLOW_PASSWORD = "your-password"
$env:DEVFLOW_CAMPAIGN_CONCURRENCY = "4,8,12,16"
$env:DEVFLOW_CAMPAIGN_WORKERS = "4"
npm run bench:campaign -- --confirm-large --path /health --method GET
```

Each stage writes a report under `benchmarks/results/` and pauses for approval before proceeding to the next stage.

---

## Supabase & Database Setup

DevFlow uses zero-config JSON file storage by default. For team deployments or production:

- **Self-Hosted PostgreSQL:** Set `DATABASE_URL=postgresql://user:password@localhost:5432/devflow`. Migrations apply automatically at startup.
- **Supabase PostgreSQL:** Set `DATABASE_URL` with your pooler connection string and enable TLS: `DB_SSL=true`.
- **Supabase Authentication:** Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in your `.env`. Supabase verifies email/password identity, and DevFlow maps it to a local application profile with roles, quotas, and target ownership.

See [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md) for detailed configuration.

---

## Self-Hosted Production Deployment

DevFlow is self-hosted open-source software. Use the documented Docker Compose setup for deployment:

1. **Host Setup:** Deploy on a Linux host with Docker, Docker Compose, and persistent PostgreSQL storage.
2. **Environment Configuration:** Copy [.env.production.example](.env.production.example) to `.env` on your deployment server.
3. **Security Hardening:**
   - Set `NODE_ENV=production`.
   - Set a unique, random 32+ character `JWT_SECRET`.
   - Set strict `CORS_ORIGIN` matching your frontend URL.
   - Set `ALLOW_LOCAL_TARGETS=false` to enforce SSRF domain verification on all targets.
4. **Deploy:**
   ```bash
   docker compose up --build -d
   ```
5. Verify health: `curl http://localhost:4000/api/health`.

See [docs/DOCKER.md](docs/DOCKER.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md) for full infrastructure guides.

---

## How DevFlow Works

```text
                                  DEVFLOW HOST (Single Machine)
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                         │
  │   ┌───────────────┐     POST /api/runs       ┌───────────────┐       enqueue            │
  │   │  Browser UI   │ ───────────────────────> │  Express API  │ ─────────────────────┐   │
  │   │ (React 19)    │ <─────────────────────── │  (Port 4000)  │                      │   │
  │   └───────────────┘        SSE Stream        └───────────────┘                      │   │
  │           ▲                                          │ read / write                 │   │
  │           │                                          ▼                              ▼   │
  │           │                                  ┌───────────────┐              ┌───────────────┐
  │           │                                  │ Storage Layer │              │ Runner Mgr &  │
  │           │                                  │ Postgres/JSON │              │  Coordinator  │
  │           │                                  └───────────────┘              └───────────────┘
  │           │                                          ▲                              │
  │           │                                          │ persist                      │ fork + IPC
  │           │                                          │                              ▼
  │           │                                          │                      ┌───────────────┐
  │           │           IPC Progress & Latency Histograms                     │  Node Workers │
  │           └──────────────────────────────────────────────────────────────── │  (1, 2, or 4) │
  │                                                                             └───────────────┘
  │                                                                                     │
  └─────────────────────────────────────────────────────────────────────────────────────┼───┘
                                                                                        │ HTTP
                                                                                        ▼
                                                                                ┌───────────────┐
                                                                                │  HTTP Target  │
                                                                                │ (Local/Remote)│
                                                                                └───────────────┘
```

<p align="center">
  <img src="docs/assets/devflow-system.svg" alt="DevFlow Single-Host Architecture and Process Pipeline" width="100%" />
</p>

### Execution Lifecycle

1. **Enqueuing:** User configures a workload and authorizes execution. API validates target permissions and inserts a `queued` run record.
2. **Workload Partitioning:** The runner boots an isolated coordinator, which partitions virtual users across $N$ child worker processes.
3. **Execution & Generation:** Each child process executes HTTP requests in an isolated event loop, measuring timing with high-resolution timers (`process.hrtime.bigint()`).
4. **IPC Telemetry Aggregation:** Workers transmit cumulative progress and 6,801-bucket histogram slices to the coordinator over IPC.
5. **SSE Broadcasting:** The coordinator merges bounded histograms, persists progress to storage, and emits SSE events consumed by the browser.
6. **Terminal Settlement:** Upon test completion, final percentiles, throughput, and status code distributions are persisted.

---

## REST API Reference

All API routes are served under `/api` (`http://127.0.0.1:4000/api`).

### Health & System Status

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "storage": "json",
  "persistence": "file"
}
```

### Create and Queue a Load Test

```http
POST /api/runs
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetId": "target_default_local",
  "path": "/slow?ms=50",
  "method": "GET",
  "concurrency": 5,
  "durationSec": 5,
  "workerCount": 1,
  "profile": "fixed",
  "timeoutMs": 5000,
  "authorized": true
}
```

### Live SSE Telemetry Stream

```http
GET /api/runs/:id/events?ticket=<stream-ticket>
Accept: text/event-stream
```

**Sample Stream Frame:**
```json
event: progress
data: {
  "runId": "run_9f4k21",
  "status": "running",
  "progressPercent": 60,
  "totalRequests": 295,
  "rps": 98.4,
  "p50": 50.8,
  "p95": 53.2,
  "p99": 56.1,
  "errorRate": 0.00
}
```

### Stop Execution

```http
POST /api/runs/:id/cancel
Authorization: Bearer <token>
```

---

## Testing & Quality Assurance

DevFlow features an automated test suite powered by Node.js's native test runner (`node:test`):

```bash
# Run full unit and integration test suite
npm test

# Run measurement validation suite (timing accuracy, isolation, assertions)
npm run test:validation

# Run TypeScript static type check (lint)
npm run lint

# Build production bundle with Vite
npm run build

# Focused bounded-memory latency histogram validation
node --test tests/unit/latency-histogram.test.js

# Real worker and telemetry integration test against loopback HTTP fixture
node --test tests/integration/real-run-telemetry.test.js

# Automated throughput benchmark against controlled target
npm run bench:ci
```

---

## Configuration Reference

All environment variables can be configured via `.env`:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `API_HOST` | `127.0.0.1` | Network interface for the API server |
| `API_PORT` | `4000` | Port bound by the Express API |
| `TARGET_PORT` | `5050` | Port for the controlled test target helper |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed browser origins (comma-separated for multi-port) |
| `VITE_API_URL` | `http://localhost:4000/api` | API endpoint used by the React web client |
| `ALLOW_LOCAL_TARGETS` | `true` locally | Allows loopback targets; explicitly set `false` in production |
| `JWT_SECRET` | *(development string)* | Secret for signing auth tokens (**change in production**) |
| `JWT_EXPIRES_IN` | `24h` | Validity duration of issued session tokens |
| `DATABASE_URL` | *(unset)* | PostgreSQL connection string. When unset, uses local JSON |
| `DB_SSL` | `false` | Enables TLS for managed Postgres; use `true` with Supabase |
| `SUPABASE_URL` | *(unset)* | Optional Supabase Auth project URL (server-side) |
| `SUPABASE_PUBLISHABLE_KEY` | *(unset)* | Optional Supabase Auth application key (safe to expose) |
| `DATA_DIR` | `./data` | Directory for `store.json` when using JSON file storage |
| `MAX_ACTIVE_RUNS` | `1` | Maximum simultaneous test runs managed by this instance |
| `REQUEST_TIMEOUT_MS` | `5000` | Default per-request timeout for worker HTTP clients |
| `RUNNER_ENGINE` | `auto` | Engine selection: `auto`, `node`, or `k6` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | *(unset)* | Optional server-side one-time checkout |
| `UPGRADE_PLAN_PRICE_INR` | `199` | One-time Pro checkout price in INR when Razorpay is enabled |

For the complete production template, see [.env.production.example](.env.production.example).

---

## Contributing

We welcome issues, feedback, and pull requests! To get started:

1. Fork the repository and create your feature branch: `git checkout -b feature/my-feature`.
2. Ensure all tests and type checks pass:
   ```bash
   npm run lint
   npm run build
   npm test
   ```
3. Commit your changes following conventional commit guidelines.
4. Submit a Pull Request. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for full guidelines.

---

## License

This project is licensed under the [MIT License](LICENSE) — see the LICENSE file for details.
