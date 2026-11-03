# DevFlow Multi-Worker Scaling Benchmark Report

**Generated:** 2026-11-03T15:06:33.813Z  
**Branch:** `roadmap/phase-0-correctness` | **Commit:** `f95189ab`  
**Platform:** Windows_NT 10.0.26300 (x64)  
**CPU:** AMD Ryzen 5 5600H with Radeon Graphics          (12 logical cores) | **RAM:** 7.3 GB  
**Node Version:** v22.14.0 | **Execution Engine:** `node` (Coordinator)  
**Target:** `http://127.0.0.1:5050/health` (GET) | **Workload:** 8 VUs · 10s per run · 3 rounds rotated  

---

## 1. Statistical Summary (Median & Min-Max Spread)

| Workers | Median RPS | RPS Spread (Min – Max) | Median p50 (ms) | Median p95 (ms) | Median p99 (ms) | Error Rate | Throughput Ratio vs 1W |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Worker** | **2,662.87** | 2659.5 – 2703.15 | 1.52 ms | 2.66 ms | 5.25 ms | 0.0000% | **1.00x** (Baseline) |
| **2 Workers** | **5,118.68** | 4581.38 – 5137.22 | 0.79 ms | 1.32 ms | 4.36 ms | 0.0000% | **1.92x** |
| **4 Workers** | **8,691.37** | 8485.59 – 8745.24 | 0.48 ms | 0.88 ms | 2.47 ms | 0.0000% | **3.26x** |

**Scaling Verdict:** **Strong Sublinear Scaling (Multi-core Utilized)** (Throughput grew 3.26x at 4 workers vs theoretical 4.0x linear maximum).

### Latency Shifts vs 1 Worker
- **2 Workers:** Median p50 moved from 1.52ms to 0.79ms (-48%).
- **4 Workers:** Median p50 moved from 1.52ms to 0.48ms (-68.4%).

---

## 2. Individual Run Matrix (Rotated Execution Order)

| Round | Workers | Total Reqs | Success | Failed | Timeouts | Cancelled | Error Rate | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| R1 | 1 | 28,563 | 28,563 | 0 | 0 | 0 | 0.0000% | 2659.5 | 1.49 | 2.66 | 5.19 | `completed` |
| R1 | 2 | 55,379 | 55,379 | 0 | 0 | 0 | 0.0000% | 5118.7 | 0.77 | 1.30 | 4.24 | `completed` |
| R1 | 4 | 91,484 | 91,484 | 0 | 0 | 0 | 0.0000% | 8745.2 | 0.48 | 0.88 | 2.43 | `completed` |
| R2 | 2 | 56,155 | 56,155 | 0 | 0 | 0 | 0.0000% | 5137.2 | 0.79 | 1.32 | 4.36 | `completed` |
| R2 | 4 | 91,305 | 91,305 | 0 | 0 | 0 | 0.0000% | 8485.6 | 0.48 | 0.88 | 2.47 | `completed` |
| R2 | 1 | 27,810 | 27,810 | 0 | 0 | 0 | 0.0000% | 2703.2 | 1.52 | 2.65 | 5.25 | `completed` |
| R3 | 4 | 92,172 | 92,172 | 0 | 0 | 0 | 0.0000% | 8691.4 | 0.46 | 0.89 | 2.61 | `completed` |
| R3 | 1 | 28,490 | 28,490 | 0 | 0 | 0 | 0.0000% | 2662.9 | 1.52 | 2.66 | 5.28 | `completed` |
| R3 | 2 | 45,823 | 45,823 | 0 | 0 | 0 | 0.0000% | 4581.4 | 1.07 | 1.52 | 4.85 | `completed` |

---

## 3. Machine Co-location & Saturation Notes

1. **Shared CPU & Network Loopback:** Both the load generation processes (1, 2, or 4 Node.js child workers + TestCoordinator) and the target HTTP server (`tools/test-target.js`) run on the **same local machine** sharing CPU cores, OS context switches, and localhost TCP stack.
2. **Localhost Socket Efficiency:** Even under loopback CPU sharing, distributing virtual users across multiple processes significantly amortizes event loop lag per core.
3. **Single Machine Scope:** This benchmark demonstrates local operating system multi-processing efficiency, not multi-node cloud network clustering.