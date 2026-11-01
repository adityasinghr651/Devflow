# ServerTest — Persistent, Secure Performance Engineering

A local-first performance engineering and load-testing workspace featuring modular Express architecture, PostgreSQL persistence with automatic migrations, JWT authentication, multi-user resource isolation, SSRF defenses, and isolated subprocess load generation (with k6 adapter support).

---

## Requirements

- **Node.js**: 20+ (Node 22 LTS recommended)
- **npm**: 10+
- **PostgreSQL**: 15+ (optional for local development; when omitted, ServerTest automatically uses isolated multi-user JSON storage)
- **k6**: (optional) automatically detected and used if installed in `PATH` or configured via `K6_BIN`.

---

## Local Development on Windows (VS Code)

### 1. Installation

Clone or open the repository in VS Code and install dependencies:

```powershell
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Key environment configurations in `.env`:
* `JWT_SECRET`: Secret key used for signing session tokens (required in production).
* `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:password@127.0.0.1:5432/servertest`).
* `ALLOW_LOCAL_TARGETS`: Set to `true` (default) for local testing; set to `false` in production.
* `CORS_ORIGIN`: Frontend development URL (`http://localhost:3000`).

### 3. Setting Up PostgreSQL (Optional for Persistent Mode)

If using PostgreSQL on Windows:

1. Create the database in PowerShell using `psql`:
   ```powershell
   psql -U postgres -c "CREATE DATABASE servertest;"
   ```
2. Set `DATABASE_URL` in your `.env` file:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/servertest
   ```
3. Migrations run **automatically** on server startup (`server/storage/migrations/001_initial_schema.sql`).
4. If `DATABASE_URL` is commented out or omitted, ServerTest gracefully operates using isolated local JSON persistence in `data/store.json`.

### 4. Running the Application

Open two terminals in VS Code:

**Terminal 1 — Backend API and Worker Supervisor**
```powershell
npm run server
```
*API will start on `http://127.0.0.1:4000` and report the active storage engine (PostgreSQL or local JSON).*

**Terminal 2 — Frontend UI**
```powershell
npm run dev
```
*Open `http://localhost:3000` in your browser.*

---

## Automated Test Suite

ServerTest uses Node.js's native test runner (`node:test` and `node:assert/strict`):

```powershell
npm test
```

This runs:
* **Database & Migrations**: Schema creation, transactional rollback on error, multi-user CRUD.
* **Authentication**: Password hashing with bcrypt, JWT token signing, validation, and rate limiting.
* **Multi-User Isolation**: Prevents cross-user target access, run access, unauthorized deletion, and privilege escalation (returns 404).
* **Worker Reliability**: Isolated child process execution, real metrics streaming, safe cancellation, watchdog timeouts, and startup crash recovery.
* **Security & SSRF**: RFC 1918 private IPv4/IPv6 blocking, cloud metadata host protection, and URL validation.

Frontend production build check:
```powershell
npm run build
```

---

## API Reference

### Authentication
* `POST /api/auth/register` — `{ "name": "...", "email": "...", "password": "..." }`
* `POST /api/auth/login` — `{ "email": "...", "password": "..." }`
* `GET /api/auth/me` — requires `Authorization: Bearer <token>`
* `POST /api/auth/logout` — requires `Authorization: Bearer <token>`

### Targets (Authenticated)
* `GET /api/targets` — lists targets owned by the authenticated user
* `POST /api/targets` — `{ "name": "API", "url": "http://localhost:3001", "environment": "Development" }`
* `DELETE /api/targets/:id` — deletes target if owned and not executing active runs

### Test Runs (Authenticated)
* `GET /api/runs` — lists runs owned by the authenticated user
* `GET /api/runs/:id` — retrieves run details and latency percentiles
* `POST /api/runs` — `{ "targetId": "...", "path": "/health", "method": "GET", "concurrency": 10, "durationSec": 10, "workerCount": 2, "authorized": true }`
* `POST /api/runs/:id/cancel` — requests cancellation of an active run

---

## Phase 7: Distributed Load Testing Architecture

DevFlow evolves from single-process load testing to coordinated local multi-process load testing via the **TestCoordinator**:

```
RunnerManager
  └─► TestCoordinator
        ├─► Workload Partitioner (Exact integer remainder VU distribution)
        ├─► Worker Process 1 (Child Process 1) ──┐
        ├─► Worker Process 2 (Child Process 2) ──┼─► Progress Aggregator (Cumulative snapshot deduplication)
        ├─► Worker Process 4 (Child Process 4) ──┘   │
        └─► Master LatencyHistogram (Additive bucket merging) ──► Unified Percentiles (p50, p95, p99)
```

### 1. Workload Partitioning
The pure helper function `partitionWorkload(runConfig, workerCount)` splits total concurrency and stage targets across workers:
* **Fixed Profile**: Total concurrency $C$ divided among $W$ workers via remainder distribution ($\sum \text{concurrency}_i = C$). Total load is never multiplied.
* **Staged Profile**: For each stage, the target VUs are partitioned across $W$ workers preserving identical stage durations and linear interpolation curves.

### 2. Progress Aggregation
Workers report progress via asynchronous cumulative snapshots over IPC. The `ProgressAggregator` maintains a per-worker state map (`Map<number, snapshot>`) to derive unified cluster metrics without double-counting repeated snapshots:
* Combined RPS: $\sum \text{totalRequests} / \text{elapsedSec}$
* Combined Error Rate: $(\sum \text{failedCount} / \sum \text{totalRequests}) \times 100\%$
* Merged HTTP Status Codes: summed per code across all workers
* Active Concurrency: $\sum \text{currentConcurrency}_i$

### 3. Additive Histogram Merging
Worker latencies are recorded in bounded-memory HDR histograms (`LatencyHistogram`, 6,801 buckets). When workers complete, their histograms are serialized and merged additively into the coordinator's master histogram:
* Percentiles ($p_{50}, p_{95}, p_{99}$) are calculated strictly from the merged histogram distribution.
* **Worker percentiles are never averaged**.
* Memory remains strictly capped at $\le 35.4\text{ KB}$ regardless of the number of workers or requests.

### 4. Worker Lifecycle & Failure Handling
* **Startup & Exit**: The coordinator coordinates child process startup and monitors exit codes.
* **Failure Cascading**: If one worker process crashes or exits unexpectedly, the coordinator immediately terminates remaining siblings with `SIGTERM`, collects available partial metrics, and marks the overall run as `failed` with diagnostic error details.
* **Coordinated Cancellation**: `POST /api/runs/:id/cancel` broadcasts `{ type: 'cancel' }` to all workers with an escalating 1s grace timeout before `SIGTERM`/`SIGKILL`.
* **Watchdog Protection**: A hard watchdog timer (`duration + 8s`) terminates all workers if execution hangs.

### 5. Running Distributed Tests
To run a distributed test across multiple local worker processes, include `"workerCount": 2` or `"workerCount": 4` in the `POST /api/runs` payload:

```bash
curl -X POST http://127.0.0.1:4000/api/runs \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetId": "<TARGET_ID>",
    "path": "/api/items",
    "method": "GET",
    "concurrency": 20,
    "durationSec": 10,
    "workerCount": 4,
    "authorized": true
  }'
```

*When `workerCount` is omitted or set to `1`, ServerTest operates in backward-compatible single-worker mode.*

### 6. Known Limitations
* **Local Process Scope**: Phase 7 coordinates local operating system child processes. It does not provide remote cloud workers, Kubernetes pods, or cross-machine coordination.
* **Hardware Resource Contention**: Spawning multiple worker processes on a machine with limited CPU cores or constrained network sockets can introduce resource contention. For optimal benchmarking, ensure total concurrency and worker counts align with available system CPU cores.

---

### System
* `GET /api/health` — reports system health and active storage engine

---

## Security & Reliability Design

1. **Subprocess Isolation**: Load tests are executed via `child_process.fork` in a separate process with a strict watchdog timer (`duration + 8s`). Load generation never blocks the Express event loop.
2. **SSRF Defense**: Validates URL protocols, rejects embedded credentials, and blocks private IPv4 subnets (`10/8`, `172.16/12`, `192.168/16`), loopback, Carrier-Grade NAT, and cloud metadata (`169.254.169.254`, `metadata.google.internal`).
3. **Multi-User Isolation**: Every target and test run is tied to an explicit `userId`. Cross-user access attempts consistently return `404 Not Found` without disclosing resource existence.
4. **Startup Crash Recovery**: On startup, any runs left in non-terminal states (`queued`, `validating`, `running`) from an abrupt server crash are automatically transitioned to `failed` with diagnostic recovery logs.
5. **State Transition Safety**: Terminal states (`completed`, `failed`, `cancelled`, `timed_out`) are strictly immutable.
