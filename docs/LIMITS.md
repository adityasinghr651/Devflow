# Limits and safety

DevFlow is a self-hosted, single-host load generator whose worker processes share CPU, memory, and network with the coordinator. Results depend on host contention, target behavior, connection reuse, and workload shape. It does not coordinate independent machines or guarantee production-scale capacity. Compare repeated runs on a quiet host and retain raw results.

The API bounds concurrency, duration, body size, run quotas, worker startup, progress, memory, and stored history. Target validation blocks local/private destinations by default in production and rechecks DNS. `ALLOW_LOCAL_TARGETS=true` is for isolated development only. Load only systems you own or are authorized to test. k6 adapter failure counters do not match the Node engine's per-category details; see [metrics](METRICS.md).
