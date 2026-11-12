# Why DevFlow?

## Catch performance regressions on every PR

DevFlow is built to run a repeatable HTTP workload, compare the result with recent comparable runs, and show the decision and bands in a CLI report or GitHub pull request comment. It connects a load test with a historical regression check, so teams can inspect performance changes while reviewing code.

DevFlow does not have a real-repository pilot yet. Its current detector has only been exercised on one Windows machine and a controlled loopback target: 0 false regression verdicts in 17 eligible stable comparisons, 5/5 detections for +25% and +50% injected latency, and 0/5 for +10%. Those small counts are not broad accuracy claims. See [the raw study report](../benchmarks/results/false-positive-study.md) and [the model description](REGRESSION_MODEL.md).

## DevFlow compared with k6 or Locust run manually

[k6](https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/) and [Locust](https://docs.locust.io/en/stable/) are load-testing tools with their own scripting and CI workflows. They are appropriate choices when teams want a flexible load generator and are comfortable managing scripts, result history, and comparisons in their own CI setup.

DevFlow packages an HTTP test runner with stored run history, an API/CLI comparison, and a GitHub Action summary. It does not establish that its load generator is more capable or more accurate than k6 or Locust. The current GitHub Action uses DevFlow's CLI and runner; it does not ingest arbitrary k6 or Locust output.

## DevFlow compared with Bencher

[Bencher](https://bencher.dev/docs/how-to/track-benchmarks/) is in the continuous benchmarking and performance regression category. Its documentation describes tracking benchmark results from local and CI runs and comparing them with historical results. DevFlow focuses on HTTP endpoint workloads and reports request throughput, latency, errors, and a comparable-run decision through its own API, CLI, and Action.

These are different implementations of a related CI problem. This page makes no claim that DevFlow is superior to Bencher. There is no external pilot or head-to-head evaluation yet.

## Get a first local result

Start the API and controlled target with `npm run dev:all`, create an account and save the local target, then use [`devflow check`](CLI.md) with that target. The [quickstart](QUICKSTART.md) has the full local setup. The GitHub workflow remains a pilot candidate until a repository owner approves a real trial.
