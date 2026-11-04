# DevFlow

DevFlow is a self-hosted web application for running and reviewing bounded HTTP load tests. It includes a React dashboard, an Express API, JSON or PostgreSQL persistence, and local child-process workers. Workers run on the API host; this project does not provide a multi-machine load generation fleet.

## Quick start

Requirements: Node.js 22.x and npm. PostgreSQL is optional for local use.

```sh
npm ci
cp .env.example .env
npm run target
```

In separate terminals, run `npm run server` and `npm run dev`. Open `http://localhost:3000`, create an account, add `http://127.0.0.1:5050` as a target, then run a small GET `/health` test. Detailed setup is in [Quickstart](docs/QUICKSTART.md); Docker deployment is in [docs/DOCKER.md](docs/DOCKER.md).

## What it includes

- Owner-scoped target and run persistence with JSON fallback or PostgreSQL.
- Input validation, authorization checks, quotas, target safety checks, and audit events.
- Local worker processes, progress streaming, cancellation, and bounded run history.
- Aggregate latency histograms and environment metadata. See [metrics](docs/METRICS.md) for definitions and limitations.
- A command-line runner and composite GitHub Action for existing DevFlow instances.

## Documentation

- [Concepts](docs/CONCEPTS.md) · [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [OpenAPI spec](docs/openapi.yaml)
- [CLI](docs/CLI.md) · [GitHub Action](docs/GITHUB_ACTION.md) · [Limits and safety](docs/LIMITS.md)
- [Statistical regression detection](docs/REGRESSION_DETECTION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md) · [FAQ, including comparison with k6](docs/FAQ.md) · [Operations](docs/OPERATIONS.md)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## Verification

```sh
npm run lint
npm run build
npm test
bash tools/quickstart-check.sh
```

Run `npm run soak` for a longer local stability check. Performance depends on host, target, and workload; use repeated measurements and inspect raw reports. DevFlow is not a substitute for production capacity planning.

## License

No license has been selected or granted yet. See `docs/roadmap/HUMAN_ACTIONS.md` before redistributing this repository.
