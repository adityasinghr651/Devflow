# Troubleshooting

- **API will not start:** verify Node 22.x, `.env` syntax, port 4000 availability, and `JWT_SECRET` length when `NODE_ENV=production`.
- **Readiness returns 503:** inspect API logs and database connectivity; `/health` is liveness, `/ready` checks storage.
- **Target rejected:** check URL format, DNS, target ownership verification, and `ALLOW_LOCAL_TARGETS`. Production blocks local targets unless explicitly overridden.
- **Run returns 429:** inspect the quota field and `Retry-After`; wait or adjust the workload within policy.
- **CLI says unauthorized:** use a valid token for the target owner and the API base URL including `/api/v1`.
- **Docker fails readiness:** verify `.env`, `POSTGRES_PASSWORD`, database health, and that migrations can run. Docker was not locally available during packaging implementation, so consult the recorded Phase 4 evidence for verification status.
- **Results vary:** remove competing load, keep the target stable, repeat runs, and compare distributions and environment metadata. Shared CI runners are noisy.
