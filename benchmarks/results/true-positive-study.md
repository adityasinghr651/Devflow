# True-positive study (with false-positive control)

Date: 2026-11-11T15:22:06.044Z
Commit: `5467dc484f60b711ba1568d74be07d0d6de52a80`
Branch: `roadmap2/phase-2-regression`
Machine: win32 10.0.26300; AMD Ryzen 5 5600H with Radeon Graphics         ; 12 logical CPUs; Node v22.14.0; x64
Target: self-started loopback HTTP server at 127.0.0.1; fixed-delay response
Workload: GET /fixed; concurrency 4; 2s per run; 1 worker; Node engine
Account: disposable temporary-storage account set to the existing paid tier to avoid its Free lifetime quota; no application quota settings were changed.
Pipeline: each measurement was launched by `node bin/devflow.js run` and completed through the API and statistical regression check.

## False-positive study

17 runs had sufficient prior history from 20 stable runs. 0 were classified as regressions. Observed false-positive rate: **0.00% (0/17)**. The first 3 run(s) did not have enough history and returned insufficient data.

## True-positive study

5 independent trials per magnitude. Each trial established five baseline runs at 50 ms, then changed the controlled target delay while keeping the workload fingerprint unchanged.

| Added latency | Baseline delay | Injected delay | Detected regressions | Observed detection rate |
|---:|---:|---:|---:|---:|
| +10% | 50 ms | 55 ms | 0/5 | 0.00% |
| +25% | 50 ms | 63 ms | 5/5 | 100.00% |
| +50% | 50 ms | 75 ms | 5/5 | 100.00% |

## Limitations

Single Windows host, one loopback target server, one temporary owner per study, independent target IDs per injected trial, and one workload shape. These counts are internal repeatability observations only; they are not expected rates for other machines, CI, applications, or teams. they are not expected rates for other machines, CI, applications, or teams. Raw per-run requests, latencies, verdicts, baseline IDs, metric bands, and study metadata are in [regression-study-raw.json](./regression-study-raw.json).
