# Docker deployment

Copy `.env.example` to `.env`, set a unique `JWT_SECRET` (at least 32 characters), set a strong `POSTGRES_PASSWORD`, and set an explicit `CORS_ORIGIN`. Then run `docker compose up --build -d`. The UI is available at `http://localhost:3000`, and the API at port 4000. Migrations run on startup. PostgreSQL data is stored in the named volume. The API container runs as an unprivileged user, uses a read-only root filesystem, and has a `/ready` health check.

Set `ALLOW_LOCAL_TARGETS=false` for public deployments. This app generates traffic from its own host; permit only authorized targets and protect the API behind TLS and trusted ingress. Docker packaging was authored for Linux containers; Docker runtime verification must be recorded separately when an engine is available.
