<div align="center">

# ⚡ DevFlow

### Enterprise-Grade Distributed Load Testing & Observability Platform

<p align="center">
  <a href="#-architecture--how-it-works"><img src="https://img.shields.io/badge/Architecture-Distributed%20Multi--Process-0284c7?style=for-the-badge&logo=cpu" alt="Distributed Architecture" /></a>
  <a href="#-empirical-benchmarks"><img src="https://img.shields.io/badge/Throughput-5%2C800%2B%20RPS%20(Local)-10b981?style=for-the-badge&logo=speedtest" alt="Throughput" /></a>
  <a href="#-mathematical-percentile-purity-hdr-histogram"><img src="https://img.shields.io/badge/Latency%20Engine-HDR%20Bounded%20Memory-8b5cf6?style=for-the-badge" alt="Latency Engine" /></a>
  <a href="#-security--network-firewall"><img src="https://img.shields.io/badge/Security-SSRF%20Protected-ef4444?style=for-the-badge&logo=shield" alt="SSRF Shield" /></a>
  <a href="#-automated-verification"><img src="https://img.shields.io/badge/Test%20Suite-66%2F66%20Passing-10b981?style=for-the-badge&logo=githubactions" alt="Test Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-gray?style=for-the-badge" alt="License MIT" /></a>
</p>

<p align="center">
  <b>DevFlow</b> is a modern, self-hosted, distributed load testing engine and performance telemetry platform. Built for engineering teams who demand <b>sub-millisecond latency precision</b>, <b>safe local multiprocessing</b>, and <b>real-time streaming analytics</b> without cloud vendor lock-in or skewed statistics.
</p>

---

<img src="docs/assets/devflow-hero-banner.png" alt="DevFlow Load Testing Platform Hero" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

---

</div>

## 🌟 Why DevFlow?

Most lightweight load testing tools suffer from two major architectural flaws:
1. **The Single-Thread Bottleneck:** Generating thousands of HTTP requests inside a single Node.js or Python event loop causes CPU contention, artificially inflating your measured response times.
2. **The "Average of Percentiles" Fallacy:** Traditional tools running multiple processes simply compute an arithmetic average of each worker's $p_{99}$ latency. **Averaging percentiles is mathematically invalid** and hides critical tail-latency spikes.

**DevFlow completely solves both problems:**

<table>
  <tr>
    <td width="50%">
      <h3>🚀 Coordinated Multi-Processing</h3>
      Distribute virtual users across <b>1, 2, or 4 isolated child worker processes</b>. Each worker gets its own dedicated V8 event loop and network sockets, scaling throughput linearly to <b>5,800+ RPS locally</b>.
    </td>
    <td width="50%">
      <h3>📊 Mathematical Percentile Accuracy</h3>
      Every worker records response times into an exact, bounded-memory <b>HDR Latency Histogram</b> (6,801 logarithmically spaced buckets). Worker histograms are additively merged, producing 100% mathematically accurate unified percentiles ($p_{50}, p_{95}, p_{99}$).
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛡️ Built-in SSRF Security Shield</h3>
      Load tests can accidentally attack internal infrastructure. DevFlow enforces strict RFC 1918 private IPv4/IPv6 blocking, DNS rebinding guards, and cloud metadata defense (`169.254.169.254`).
    </td>
    <td width="50%">
      <h3>📡 Live Streaming Observability</h3>
      Server-Sent Events (SSE) push unified cluster metrics (active VUs, RPS, error rate, status code breakdowns) to a modern, reactive React dashboard with zero polling lag.
    </td>
  </tr>
</table>

---

<div align="center">

## 🖥️ Modern Developer Experience

<p align="center">
  Clean, ergonomic, and aesthetic web interface crafted for high-velocity performance debugging.
</p>

<img src="docs/assets/devflow-ui-preview.jpg" alt="DevFlow UI Experience" width="100%" style="border-radius: 12px; border: 1px solid #1e293b; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" />

</div>

---

## 🏗️ Architecture & How It Works

DevFlow implements a **hierarchical coordinator-worker architecture** that isolates load generation from HTTP API handling, guaranteeing uninterrupted server responsiveness.

<div align="center">
  <img src="docs/assets/architecture.svg" alt="DevFlow Distributed Architecture Diagram" width="100%" style="border-radius: 12px; margin: 16px 0;" />
</div>

### How the Distributed Engine Works (In Plain English)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Web UI
    participant API as Express API Gateway
    participant Coord as TestCoordinator
    participant W1 as Worker Process 1 (Child)
    participant W2 as Worker Process 2 (Child)
    participant Target as Target Server

    Dev->>API: POST /api/runs (concurrency: 100, workerCount: 2)
    API->>Coord: Spawn Coordinator & Partition Workload
    Note over Coord: Exact Remainder Split: 50 VUs to W1, 50 VUs to W2
    Coord->>W1: fork() & IPC start (50 VUs)
    Coord->>W2: fork() & IPC start (50 VUs)
    
    par Load Generation
        W1->>Target: HTTP Keep-Alive Traffic
        W2->>Target: HTTP Keep-Alive Traffic
    and Live Telemetry
        W1-->>Coord: IPC progress snapshot (cumulative reqs, errors)
        W2-->>Coord: IPC progress snapshot (cumulative reqs, errors)
        Coord-->>Dev: SSE Stream: Unified Cluster RPS & Latency
    end

    Note over W1,W2: Test Duration Finishes
    W1->>Coord: IPC completed + Serialized HDR Histogram
    W2->>Coord: IPC completed + Serialized HDR Histogram
    Note over Coord: Master Additive Merge (6,801 bins, ≤35KB memory)
    Coord->>API: Persist Final Unskewed Percentiles (p50, p95, p99)
    API-->>Dev: Run Completed
```

### 1. Fair-Share Workload Partitioning
When you submit a test with 100 Virtual Users across 4 workers:
- **Total Concurrency is Strictly Conserved:** Each worker receives exactly 25 Virtual Users ($100 \div 4 = 25$). 
- **Integer Remainder Distribution:** If you request 7 Virtual Users across 2 workers, Worker 1 receives 4 and Worker 2 receives 3. Total load is **never multiplied**.
- **Stage Profiles:** For ramp-up/ramp-down tests, target concurrency curves are split across workers while maintaining identical timeline interpolation.

### 2. Additive Histogram Merging (Why Your Percentiles Stay True)
Averaging worker percentiles produces false data. For example:
- Worker 1 ($N=1,000$ requests) has a $p_{99}$ of **10 ms**.
- Worker 2 ($N=1,000$ requests) hits a database lock and has a $p_{99}$ of **200 ms**.
- The mathematical average $(10 + 200) / 2 = 105\text{ ms}$ is **wrong**.

Instead of averaging numbers, DevFlow workers accumulate latency values into **6,801 logarithmic bins** covering $0\text{ ms}$ to $60,000\text{ ms}$. Upon completion, the coordinator sums the counts of matching bins additively:

$$\text{Bucket}[k]_{\text{master}} = \sum_{w=1}^{W} \text{Bucket}[k]_w$$

The final $p_{50}, p_{95}, \text{and } p_{99}$ percentiles are calculated directly from this unified distribution. Memory remains strictly bounded to **$\le 35.4\text{ KB}$** regardless of whether you record 10,000 or 10,000,000 requests.

### 3. Fail-Safe Worker Lifecycle & Cascading Teardown
- **Zero Orphaned Processes:** Every worker child process is actively tracked via PID and IPC channels.
- **Immediate Crash Cascading:** If a worker crashes or encounters an unexpected exception, the coordinator instantly sends `SIGTERM` to all sibling workers, saves available diagnostic data, and marks the run `failed`.
- **Graceful Cancellation:** Cancelling an active run broadcasts an IPC cancel signal with an escalating 1-second timeout before issuing `SIGKILL`, ensuring immediate socket cleanup.
- **Hard Watchdog Protection:** A background timer (`duration + 8s`) guarantees that hanging child processes are terminated, protecting server memory.

---

## 📈 Empirical Benchmarks

Tested on a standard development machine against a local HTTP target (`http://127.0.0.1:5050/health`) running an identical 8-VU, 30-second fixed workload:

| Worker Count | OS Process Delta | Total Requests Completed | Throughput (RPS) | Scaling Factor | Latency $p_{50}$ | Latency $p_{95}$ | Latency $p_{99}$ | Error Rate |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Worker** | $+1$ Child | 57,004 | **1,507.13 RPS** | 1.00x | 2.14 ms | 4.64 ms | 7.80 ms | 0.00% |
| **2 Workers** | $+2$ Children | 100,341 | **3,071.91 RPS** | **2.04x** | 0.99 ms | 2.22 ms | 5.53 ms | 0.00% |
| **4 Workers** | $+4$ Children | 183,036 | **5,776.01 RPS** | **3.83x** | **0.63 ms** | **1.25 ms** | **3.37 ms** | 0.00% |

> **Key Insight:** Moving from 1 to 4 workers eliminated single-threaded event loop queuing, cutting median response latency by **70.5%** ($2.14\text{ms} \rightarrow 0.63\text{ms}$) while increasing load output by **3.83x**.

---

## 🚀 Quickstart Guide

### Prerequisites
- **Node.js**: v20+ (Node 22 LTS recommended)
- **PostgreSQL**: v15+ *(Optional — when omitted, DevFlow runs zero-config with isolated file storage)*
- **Git**

### 1. Clone & Install
```bash
git clone https://github.com/adityasinghr651/Devflow.git
cd DevFlow
npm install
```

### 2. Environment Setup
Copy the production-ready environment template:
```bash
cp .env.example .env
```

Key environment configurations in `.env`:
```env
# Required in Production
API_PORT=4000
API_HOST=127.0.0.1
JWT_SECRET=generate-a-strong-random-32-byte-secret-here
ALLOW_LOCAL_TARGETS=false   # Set to true only in development
CORS_ORIGIN=http://localhost:3000

# PostgreSQL storage (migrations apply automatically; when unset, local JSON files are used)
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/devflow
# Optional local JSON file directory, relative to this .env file
DATA_DIR=./data
```

When `DATABASE_URL` is set, the API must connect and finish migrations before it starts; it does not fall back to local JSON if PostgreSQL is unavailable. Without `DATABASE_URL`, records are durably stored in `DATA_DIR/store.json` (or the repository's `data/store.json` by default), which is local file storage rather than PostgreSQL. Check `http://127.0.0.1:4000/api/health`; its `storage` and `persistence` fields show the active backend. Environment files are discovered from the project root and parent checkout when running inside a Git worktree.

### 3. Launch DevFlow
Open two terminals or use a process manager like PM2:

**Terminal 1 — Backend API & Coordinator:**
```bash
npm run server
```
*API starts on `http://127.0.0.1:4000`.*

**Terminal 2 — Frontend UI:**
```bash
npm run dev
```
*Open `http://localhost:3000` in your browser.*

Sign in or create an account before adding targets or launching tests. The demo workspace is read-only and contains illustrative sample data.

---

## 🐳 Production Deployment

### Docker Compose Setup
For a robust, one-command production deployment with PostgreSQL:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: devflow-db
    restart: always
    environment:
      POSTGRES_DB: devflow
      POSTGRES_USER: devflow_user
      POSTGRES_PASSWORD: devflow_secure_password
    volumes:
      - devflow_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  devflow-api:
    build: .
    container_name: devflow-api
    restart: always
    depends_on:
      - postgres
    environment:
      PORT: 4000
      NODE_ENV: production
      JWT_SECRET: super-secure-jwt-secret-key-32-characters
      DATABASE_URL: postgresql://devflow_user:devflow_secure_password@postgres:5432/devflow
      ALLOW_LOCAL_TARGETS: "false"
      CORS_ORIGIN: "https://your-domain.com"
    ports:
      - "4000:4000"

volumes:
  devflow_data:
```

### Production Host Kernel Tuning
When driving high concurrency ($\ge 5,000\text{ RPS}$), optimize system file descriptors and TCP connection recycling:

```bash
# Increase file descriptor limit
ulimit -n 65535

# Optimize ephemeral socket reuse (Linux)
sudo sysctl -w net.ipv4.tcp_tw_reuse=1
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```

---

## 🔌 API Reference & CLI Usage

### 1. Authenticate
```bash
# Register an account
curl -X POST http://127.0.0.1:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Performance Team","email":"perf@company.com","password":"StrongPassword123!"}'

# Obtain JWT token
export TOKEN=$(curl -s -X POST http://127.0.0.1:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"perf@company.com","password":"StrongPassword123!"}' | jq -r .token)
```

### 2. Register & Verify Target
```bash
export TARGET_ID=$(curl -s -X POST http://127.0.0.1:4000/api/targets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API Gateway","url":"https://api.example.com","environment":"Staging"}' | jq -r .id)

# Verify ownership
curl -X POST http://127.0.0.1:4000/api/targets/$TARGET_ID/verify \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Launch a Distributed Load Test (4 Workers)
```bash
curl -X POST http://127.0.0.1:4000/api/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetId": "'"$TARGET_ID"'",
    "path": "/v1/health",
    "method": "GET",
    "concurrency": 100,
    "durationSec": 30,
    "workerCount": 4,
    "authorized": true
  }'
```

### 4. Stream Live Progress (SSE)
```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:4000/api/runs/<RUN_ID>/events
```

---

## 🧪 Automated Verification Suite

DevFlow ships with a battle-tested regression and integration test suite powered by Node.js native test runner:

```bash
# Run unit & full regression suite (66/66 tests)
npm test

# Run live multi-process distributed runner smoke test
node tools/live-smoke-test.js
```

### Test Coverage Highlights
- **Histogram Merging:** Additive bucket arithmetic, exact percentile verification, overflow handling, memory cap enforcement.
- **Workload Partitioning:** Fixed and staged concurrency remainder allocation tests.
- **Process Orchestration:** Multi-worker child process spawning, graceful cancellation, and crash cleanup.
- **SSRF Defense:** IPv4/IPv6 private subnets, cloud metadata IPs, and protocol bypass prevention.
- **Multi-Tenant Isolation:** Guaranteed `404 Not Found` across user boundaries without disclosing resource presence.

---

## 🔒 Security Design

1. **Subprocess Sandboxing:** Load generation occurs strictly in child processes. The Express API event loop is never blocked by load generator socket activity.
2. **SSRF Network Boundaries:** Automatically rejects embedded credentials, private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopbacks, and cloud instance metadata services (`169.254.169.254`).
3. **Database Migration Safety:** Migrations are executed with transaction rollbacks on failure, guaranteeing database consistency.
4. **Credential Security:** Passwords hashed with `bcrypt` (10 rounds); API requests authenticated with stateless signed JWT tokens.

---

## 📄 License

DevFlow is open-source software licensed under the **[MIT License](LICENSE)**.
