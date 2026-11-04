# Architecture

```mermaid
flowchart LR
  UI[React dashboard] --> API[Express API]
  CLI[DevFlow CLI / CI] --> API
  API --> Store[(JSON or PostgreSQL)]
  API --> Coordinator[Runner coordinator]
  Coordinator --> W1[Worker process]
  Coordinator --> W2[Worker process]
  W1 --> Target[Authorized HTTP target]
  W2 --> Target
  Coordinator --> API
```

The API authenticates and validates requests, applies per-user quotas and target safety checks, persists run state, and dispatches work to local child processes. Worker snapshots update the stored run and SSE stream. The worker processes are on the same machine as the API; this is not a distributed fleet or a cloud load generator. See [metrics semantics](METRICS.md) and [operations](OPERATIONS.md).
