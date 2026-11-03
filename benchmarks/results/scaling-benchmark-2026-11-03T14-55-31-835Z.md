# DevFlow Multi-Worker Scaling Benchmark Report

**Generated:** 2026-11-03T14:55:31.835Z  
**Branch:** `roadmap/phase-0-correctness` | **Commit:** `f95189ab`  
**Platform:** Windows_NT 10.0.26300 (x64)  
**CPU:** AMD Ryzen 5 5600H with Radeon Graphics          (12 logical cores) | **RAM:** 7.3 GB  
**Node Version:** v22.14.0 | **Execution Engine:** `node` (Coordinator)  
**Target:** `http://127.0.0.1:5050/health` (GET) | **Workload:** 8 VUs · 10s per run · 3 rounds rotated  

---

## 1. Statistical Summary (Median & Min-Max Spread)

| Workers | Median RPS | RPS Spread (Min – Max) | Median p50 (ms) | Median p95 (ms) | Median p99 (ms) | Error Rate | Throughput Ratio vs 1W |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Worker** | **2,713.29** | 2548.39 – 2857.98 | 1.55 ms | 2.93 ms | 5.7 ms | 0.0000% | **1.00x** (Baseline) |
| **2 Workers** | **4,974.9** | 4888.86 – 5041.25 | 0.83 ms | 1.5 ms | 4.6 ms | 0.0000% | **1.83x** |
| **4 Workers** | **8,497.72** | 8367.82 – 8604.75 | 0.56 ms | 1 ms | 2.87 ms | 0.0000% | **3.13x** |

**Scaling Verdict:** **Strong Sublinear Scaling (Multi-core Utilized)** (Throughput grew 3.13x at 4 workers vs theoretical 4.0x linear maximum).

### Latency Shifts vs 1 Worker
- **2 Workers:** Median p50 moved from 1.55ms to 0.83ms (-46.5%).
- **4 Workers:** Median p50 moved from 1.55ms to 0.56ms (-63.9%).

---

## 2. Individual Run Matrix (Rotated Execution Order)

| Round | Workers | Total Reqs | Success | Failed | Timeouts | Cancelled | Error Rate | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| R1 | 1 | 25,675 | 25,675 | 0 | 0 | 0 | 0.0000% | 2548.4 | 1.63 | 2.93 | 5.79 | `completed` |
| R1 | 2 | 49,309 | 49,309 | 0 | 0 | 0 | 0.0000% | 4888.9 | 0.83 | 1.50 | 4.71 | `completed` |
| R1 | 4 | 86,951 | 86,951 | 0 | 0 | 0 | 0.0000% | 8604.8 | 0.56 | 1.00 | 2.63 | `completed` |
| R2 | 2 | 50,152 | 50,152 | 0 | 0 | 0 | 0.0000% | 4974.9 | 0.83 | 1.50 | 4.60 | `completed` |
| R2 | 4 | 85,861 | 85,861 | 0 | 0 | 0 | 0.0000% | 8497.7 | 0.56 | 1.02 | 2.87 | `completed` |
| R2 | 1 | 28,777 | 28,777 | 0 | 0 | 0 | 0.0000% | 2858.0 | 1.53 | 2.83 | 5.42 | `completed` |
| R3 | 4 | 90,841 | 90,841 | 0 | 0 | 0 | 0.0000% | 8367.8 | 0.50 | 1.00 | 2.95 | `completed` |
| R3 | 1 | 27,331 | 27,331 | 0 | 0 | 0 | 0.0000% | 2713.3 | 1.55 | 2.96 | 5.70 | `completed` |
| R3 | 2 | 55,121 | 55,121 | 0 | 0 | 0 | 0.0000% | 5041.3 | 0.78 | 1.36 | 4.38 | `completed` |

---

## 3. Machine Co-location & Saturation Notes

1. **Shared CPU & Network Loopback:** Both the load generation processes (1, 2, or 4 Node.js child workers + TestCoordinator) and the target HTTP server (`tools/test-target.js`) run on the **same local machine** sharing CPU cores, OS context switches, and localhost TCP stack.
2. **Localhost Socket Efficiency:** Even under loopback CPU sharing, distributing virtual users across multiple processes significantly amortizes event loop lag per core.
3. **Single Machine Scope:** This benchmark demonstrates local operating system multi-processing efficiency, not multi-node cloud network clustering.