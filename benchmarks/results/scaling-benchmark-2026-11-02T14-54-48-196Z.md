# DevFlow Multi-Worker Scaling Benchmark Report

**Generated:** 2026-11-02T14:54:48.196Z  
**Branch:** `fix/phase-7-metrics-correctness` | **Commit:** `65b7bf7f`  
**Platform:** Windows_NT 10.0.26300 (x64)  
**CPU:** AMD Ryzen 5 5600H with Radeon Graphics          (12 logical cores) | **RAM:** 7.3 GB  
**Node Version:** v22.14.0 | **Execution Engine:** `node` (Coordinator)  
**Target:** `http://127.0.0.1:5050/health` (GET) | **Workload:** 8 VUs · 5s per run · 3 rounds rotated  

---

## 1. Statistical Summary (Median & Min-Max Spread)

| Workers | Median RPS | RPS Spread (Min – Max) | Median p50 (ms) | Median p95 (ms) | Median p99 (ms) | Error Rate | Throughput Ratio vs 1W |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Worker** | **2,855.06** | 2605.08 – 2856.02 | 1.96 ms | 3.54 ms | 6.46 ms | 0.0000% | **1.00x** (Baseline) |
| **2 Workers** | **4,568.52** | 4482.79 – 5633.57 | 1.07 ms | 1.94 ms | 5.35 ms | 0.0000% | **1.6x** |
| **4 Workers** | **7,788.63** | 7661.12 – 7894.91 | 0.69 ms | 1.37 ms | 3.83 ms | 0.0000% | **2.73x** |

**Scaling Verdict:** **Moderate Sublinear Scaling (CPU Saturated)** (Throughput grew 2.73x at 4 workers vs theoretical 4.0x linear maximum).

### Latency Shifts vs 1 Worker
- **2 Workers:** Median p50 moved from 1.96ms to 1.07ms (-45.4%).
- **4 Workers:** Median p50 moved from 1.96ms to 0.69ms (-64.8%).

---

## 2. Individual Run Matrix (Rotated Execution Order)

| Round | Workers | Total Reqs | Success | Failed | Timeouts | Cancelled | Error Rate | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| R1 | 1 | 13,226 | 13,226 | 0 | 0 | 0 | 0.0000% | 2605.1 | 2.05 | 4.09 | 6.79 | `completed` |
| R1 | 2 | 22,795 | 22,795 | 0 | 0 | 0 | 0.0000% | 4482.8 | 1.11 | 1.94 | 5.35 | `completed` |
| R1 | 4 | 40,343 | 40,343 | 0 | 0 | 0 | 0.0000% | 7894.9 | 0.69 | 1.37 | 3.83 | `completed` |
| R2 | 2 | 23,336 | 23,336 | 0 | 0 | 0 | 0.0000% | 4568.5 | 1.07 | 1.97 | 5.46 | `completed` |
| R2 | 4 | 39,722 | 39,722 | 0 | 0 | 0 | 0.0000% | 7788.6 | 0.71 | 1.46 | 4.42 | `completed` |
| R2 | 1 | 14,498 | 14,498 | 0 | 0 | 0 | 0.0000% | 2855.1 | 1.96 | 3.54 | 6.46 | `completed` |
| R3 | 4 | 44,197 | 44,197 | 0 | 0 | 0 | 0.0000% | 7661.1 | 0.64 | 1.12 | 3.25 | `completed` |
| R3 | 1 | 14,480 | 14,480 | 0 | 0 | 0 | 0.0000% | 2856.0 | 1.95 | 3.18 | 6.08 | `completed` |
| R3 | 2 | 28,596 | 28,596 | 0 | 0 | 0 | 0.0000% | 5633.6 | 0.86 | 1.67 | 4.71 | `completed` |

---

## 3. Machine Co-location & Saturation Notes

1. **Shared CPU & Network Loopback:** Both the load generation processes (1, 2, or 4 Node.js child workers + TestCoordinator) and the target HTTP server (`tools/test-target.js`) run on the **same local machine** sharing CPU cores, OS context switches, and localhost TCP stack.
2. **Localhost Socket Efficiency:** Even under loopback CPU sharing, distributing virtual users across multiple processes significantly amortizes event loop lag per core.
3. **Single Machine Scope:** This benchmark demonstrates local operating system multi-processing efficiency, not multi-node cloud network clustering.