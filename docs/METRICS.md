# DevFlow Metrics Specification & Aggregation Architecture

## 1. Metric Definitions & Accounting Rules

This section is the current metric contract. Error rates are percentages (not fractions) at the API boundary and in storage. Cancellation is tracked separately and excluded from both the error-rate denominator and latency distribution.

DevFlow enforces strict mathematical and statistical purity in all measured metrics. All counters, rates, and latency percentiles adhere to the formal definitions below:

| Metric | Field | Classification & Mathematical Definition |
| :--- | :--- | :--- |
| **Total Requests** | `totalRequests` | Total number of HTTP requests that reached a definitive terminal outcome: <br>$$\text{totalRequests} = \text{successCount} + \text{failedCount}$$<br>*Note: Cancelled in-flight requests are excluded from this denominator.* |
| **Successful Requests** | `successCount` | HTTP responses with the expected status (2xx by default; a configured exact `assertions.status` overrides the expected code) and all configured assertions passing. |
| **HTTP Errors** | `httpErrorCount` | HTTP responses with non-2xx status codes (`4xx` client errors, `5xx` server errors). |
| **Timeouts** | `timeoutCount` | Requests terminated by the per-request watchdog timer (`AbortSignal.timeout(timeoutMs)`). |
| **Network Errors** | `networkErrorCount` | Low-level transport failures: connection refused (`ECONNREFUSED`), socket resets (`ECONNRESET`), and DNS resolution failure. |
| **Blocked Redirects** | `redirectBlockedCount` | Redirects are rejected instead of followed. This is a separate failure category. |
| **Assertion Failures** | `assertionFailureCount` | Expected response status/body/JSON assertions failed. Counted once per request, as a distinct failure category. |
| **Cancelled Requests** | `cancelledCount` | Requests intentionally aborted mid-flight due to user or coordinator cancellation (`AbortError` when `isCancelled === true`). These requests **never finished** and are therefore **excluded from latency percentiles and from the error rate denominator**. |
| **Failed Requests** | `failedCount` | Total failed requests:<br>$$\text{failedCount} = \text{httpErrorCount} + \text{timeoutCount} + \text{networkErrorCount} + \text{redirectBlockedCount} + \text{assertionFailureCount}$$ |
| **Error Rate** | `errorRate` | Percentage of completed requests resulting in failure (0.0000% – 100.0000%):<br>$$\text{errorRate} = \begin{cases} 0 & \text{if } \text{totalRequests} = 0 \\ \frac{\text{failedCount}}{\text{totalRequests}} \times 100 & \text{otherwise} \end{cases}$$<br>*Stored in PostgreSQL as `NUMERIC(7, 4)` and in JSON with at least 4 decimal places.* |
| **Throughput (RPS)** | `rps` | Completed requests divided by the cluster measurement window, from the earliest counted request start to the latest counted request completion across workers. Worker spawn time is excluded. The window is exposed as `measurementWindowSec`. |
| **Percentiles** | `p50`, `p95`, `p99` | Response time percentiles computed via Nearest-Rank interpolation over the additive 6,801-bucket HDR latency histogram. |

---

## 2. Multi-Worker Aggregation Architecture

### A. Additive Bucket Merging (Never Average Percentiles)
Averaging percentiles from independent workers is mathematically invalid and masks critical tail latencies. In DevFlow:
1. Each worker process records exact request durations into an internal `LatencyHistogram` (6,801 logarithmic buckets across 5 tiers: 0–10ms @ 0.01ms resolution, 10–100ms @ 0.1ms, 100–1,000ms @ 1ms, 1s–10s @ 10ms, 10s–60s @ 100ms, plus unclamped overflow tracking).
2. When workers complete, their histograms are serialized and merged additively into the coordinator's master histogram:
   $$\text{Bucket}[k]_{\text{master}} = \sum_{w=1}^{W} \text{Bucket}[k]_w$$
3. Final percentiles ($p_{50}, p_{95}, p_{99}$) are derived strictly from the master merged distribution. Memory is strictly bounded to $\le 35.4\text{ KB}$ regardless of the number of workers or total requests.

### B. Cumulative Snapshot Deduplication
Workers emit cumulative progress snapshots over IPC every 350ms. The `ProgressAggregator` maintains a per-worker state map (`Map<number, snapshot>`) to derive cluster metrics without double-counting repeated snapshots.

### C. Partial Worker Recovery on Crash/Kill
If a worker process is terminated by the 1-second cancellation grace timeout, crashes, or exits code 0 without sending its complete summary:
1. The coordinator falls back to the worker's last recorded cumulative progress snapshot in `ProgressAggregator`.
2. The final run summary is marked with `partialWorkers: [workerIndex]` and `histogramComplete: false`.
3. Requests completed prior to termination are preserved in the run total rather than vanishing.

---

## 3. Empirical Results Comparison

### A. Previously Reported Results (Historical Baseline)
*Single 30-second fixed workload (8 VUs) executed during initial Phase 7 smoke test:*
- **1 Worker:** 1,507.13 RPS | p50: 2.14 ms | p95: 4.64 ms | Error Rate: 0.0035% (2 timeouts / 57,004 reqs)
- **2 Workers:** 3,071.91 RPS (2.04x) | p50: 0.99 ms | p95: 2.22 ms | Error Rate: 0.0000%
- **4 Workers:** 5,776.01 RPS (3.83x) | p50: 0.63 ms | p95: 1.25 ms | Error Rate: 0.0000%

### B. Newly Verified Results (Rotated 3-Round Matrix)
*Executed on AMD Ryzen 5 5600H (12 logical cores, 7.3 GB RAM, Node v22.14.0) with warm-up and rotated worker ordering (1-2-4 / 2-4-1 / 4-1-2) via `npm run bench:scaling`:*

| Worker Count | Median Throughput | Throughput Spread (Min – Max) | Median $p_{50}$ | Median $p_{95}$ | Scaling Factor vs 1W | $p_{50}$ Latency Delta |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Worker** | **2,855.1 RPS** | 2,605.1 – 2,856.0 RPS | 1.96 ms | 3.54 ms | 1.00x | Baseline |
| **2 Workers** | **4,568.5 RPS** | 4,482.8 – 5,633.6 RPS | 1.07 ms | 1.94 ms | **1.60x** | **-45.4%** |
| **4 Workers** | **7,788.6 RPS** | 7,661.1 – 7,894.9 RPS | 0.69 ms | 1.37 ms | **2.73x** | **-64.8%** |

*Scaling Verdict: Strong multi-process scaling where distributing virtual users across 4 OS child processes increased throughput to ~7,800 RPS while reducing median latency by 64.8%.*

---

## 4. Known Limitations & Scope Clarification

- Existing JSON and Postgres records receive a zero default for `redirectBlockedCount` when read after migration.
- Optional response assertions support exact status, literal `bodyContains`, and a bounded JSON path subset with `equals`, `exists`, and `notExists`. JSON paths reject prototype-related keys and executable expressions. A configured assertion reads at most 64 KiB of each response; oversized bodies fail the assertion. With no assertions configured, the response body is cancelled without being read.
- Each run records the selected engine, worker count, Node version, operating system, CPU, memory, runner version, and commit in `environmentMetadata`. k6 does not expose Node's detailed category counters; only its aggregate error result is available.
- Runs with response assertions use the Node engine so an optional k6 installation cannot skip those checks.
- When no request reaches a counted terminal outcome, the legacy API currently reports RPS as `0`; consumers should treat it as unavailable when `totalRequests` is zero.
- The optional k6 adapter reports the aggregate failed count from k6's `http_req_failed` metric; it does not yet provide the per-category failure counters available from the Node engine.

> [!IMPORTANT]
> **Single-Machine Operating System Multiprocessing:**  
> DevFlow currently implements a **local multi-process load testing engine on a single operating system host** using Node.js `child_process.fork()`. It is **NOT** a distributed multi-node cloud cluster (e.g. Kubernetes daemonsets, distributed agent networks, or Redis/etcd clusters).

1. **Host Co-location:** Both DevFlow's worker processes and local test targets share the host CPU, memory, and operating system network loopback stack. High worker counts on machines with fewer than 4 physical cores can introduce local CPU contention.
2. **Production-Scale Validation:** Testing has been conducted locally against controlled HTTP microservices. Validation against large-scale distributed cloud infrastructure with network latency hops has not yet been performed.

