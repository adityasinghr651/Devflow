# Phase 2 — Regression detector evidence

Study date: 2026-11-11 (UTC)
Branch: `roadmap2/phase-2-regression`
Study commit: `5467dc484f60b711ba1568d74be07d0d6de52a80`
Machine: Windows 11 (`win32`, release `10.0.26300`), AMD Ryzen 5 5600H, 12 logical CPUs, Node `v22.14.0`, x64
Target: project-started HTTP server bound to `127.0.0.1`
Pipeline: Node CLI → DevFlow API → local Node runner → regression endpoint. Each recorded run came from `node bin/devflow.js run`; no external target was contacted.

## T2.1 Model documentation

`docs/REGRESSION_MODEL.md` records the implemented fingerprint, owner-scoped baseline history, five-run window, three-run minimum, completed-run quality filters, median/MAD calculations, metric-specific thresholds, verdict precedence, and limitations. `docs/REGRESSION_DETECTION.md` and the API/CLI/Action output now disclose the used/available baseline window and decision bands. Added tests verify the history size and that missing measurements stay `null` and return `insufficient_data` instead of being presented as zero.

## T2.2 False-positive study

Workload for all runs: `GET /fixed`, concurrency 4, duration 2 seconds, 1 Node worker. The server returned a fixed 50 ms delay. The study ran 20 stable measurements; the first three correctly returned `insufficient_data`, leaving 17 eligible comparisons. **0/17 eligible runs were incorrectly called regressions (observed 0.00%).**

## T2.3 True-positive study

Five independent trials per magnitude. Each trial used a fresh target ID and five 50 ms baselines, then changed only the server-side fixed delay while preserving the workload fingerprint:

| Added latency | Injected delay | Detected | Observed rate |
|---:|---:|---:|---:|
| +10% | 55 ms | 0/5 | 0.00% |
| +25% | 63 ms | 5/5 | 100.00% |
| +50% | 75 ms | 5/5 | 100.00% |

These are small single-host counts, not broad accuracy guarantees. The +10% cases did not cross the current 19.3563% p95 minimum-change threshold. This is a measured sensitivity limitation; the study does not justify lowering the threshold on only 17 eligible stable comparisons, so no threshold changes were made.

Raw per-run requests, latency values, verdicts, bands, baseline IDs, and metadata are in [the false-positive study](../../../benchmarks/results/false-positive-study.md), [the true-positive study](../../../benchmarks/results/true-positive-study.md), and [the raw JSON](../../../benchmarks/results/regression-study-raw.json).

## T2.4 Noise reduction decision

No noise-reduction change was indicated by this sample: the observed stable workload had 0/17 false regressions. The 10% injected slowdown miss is consistent with the model's documented minimum-change threshold. Avoiding a threshold reduction without a larger and more representative variance study is the evidence-based decision. Validate against more workloads and actual CI before retuning.

## Standard verification

- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed; Vite transformed 1,689 modules and built the production assets.
- `node --test` run separately for all 39 files in `tests/unit`, `tests/integration`, and `tests/validation`: 182 passed, 1 skipped, 0 failed.
- `npm test`, run twice in succession: each 183 tests, 182 passed, 1 skipped, 0 failed; both commands exited normally. Run 1 took 98,165 ms and run 2 took 97,777 ms.
- The one skip is the existing Windows-incompatible child-process signal test in `server-restart.test.js`.
- `git diff --check`: passed. No DevFlow/test runner process remained after the completed suite.

## Gate result

Phase 2 gate: **PASS WITH DOCUMENTED SENSITIVITY LIMITATION**. The baseline and injected studies ran through the actual CLI and API, raw data is retained, the statistical model is documented, and standard verification passed. No claims are made beyond this local workload and machine.
