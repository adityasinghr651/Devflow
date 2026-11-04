# Concepts

- **Target:** An owner-scoped HTTP base URL that must pass URL and ownership checks before use.
- **Run:** A bounded workload against a target, saved with configuration and final measurements.
- **Virtual user / concurrency:** Concurrent request loops. Work is divided among local worker processes.
- **Worker:** A child process that generates traffic; workers share the coordinator host and network.
- **RPS and latency:** Aggregate requests per second and merged request latency distribution. Percentiles are computed from histogram counts rather than averaged across workers.
- **Assertions:** Optional response expectations that contribute to assertion failure counts.
- **Engine:** The Node runner is the verified default; k6 is optional and has a different failure detail surface.
