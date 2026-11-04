# Operations

## Storage and readiness

JSON storage is the zero-setup local default. PostgreSQL is recommended for shared or production deployments; set `DATABASE_URL`. The API exposes `/api/health` for process liveness and `/api/ready` for storage readiness. Readiness returns 503 when the database check fails.

## Runtime limits

| Variable | Default | Maximum / behavior |
|---|---:|---|
| `MAX_DURATION_SEC` | 30 seconds | 3600 seconds hard ceiling |
| `MAX_RUNS_STORED_PER_USER` | 1000 | Prunes oldest terminal runs per user; active runs are retained |
| `WORKER_STARTUP_TIMEOUT_MS` | 30000 | Worker startup supervision |
| `WORKER_NO_PROGRESS_TIMEOUT_MS` | 15000 | Fails a worker that stops reporting progress |
| `WORKER_MEMORY_MB` | 512 MiB | Node heap cap per worker |
| `MAX_ACTIVE_RUNS_PER_USER` | 3 | Active-run quota |
| `MAX_RUNS_PER_DAY` | 100 | Rolling daily run quota |
| `MAX_VU_SECONDS_PER_DAY` | 36000 | VU-second budget |

The runner starts with conservative limits. Increase them only for trusted deployments and controlled targets. Run retention removes terminal history; export records before increasing the cap in a long-running shared deployment.

## Shutdown and reconciliation

On SIGINT or SIGTERM, the API stops accepting new connections, cancels queued and active runs, waits up to eight seconds, escalates worker termination if needed, and closes storage. At next startup, any run left queued, validating, running, or cancelling is marked failed with a restart explanation. Queued work is intentionally failed rather than replayed because its raw execution input is not persisted.

## Logs

HTTP request and error logs are JSON. `requestId` is returned as `X-Request-Id`; `runId` and `workerIndex` identify runner events. Logs omit authorization headers, cookies, request bodies, and query strings. Request fields include method, route path, status, and request ID. Do not add raw run configuration or exception payloads to log records.

## Soak procedure

Run `npm run soak` for a 30-minute loopback workload. `SOAK_DURATION_SEC` can shorten local investigations; `npm run soak:ci` runs the 2-minute CI profile. CSV samples and a JSON summary are written to `benchmarks/results/`. The summary excludes the first five minutes as warm-up and checks coordinator/worker RSS and worker heap spread against the recorded thresholds. The current Windows implementation records process RSS and event-loop lag; OS file-descriptor counts are available only where `/proc/self/fd` exists.
