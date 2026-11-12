# Quickstart

DevFlow is designed to compare repeatable HTTP workloads with recent history; see [Why DevFlow](WHY_DEVFLOW.md) for its measured scope and honest tool comparisons.

## Requirements

Use Node.js 22.x and npm. PostgreSQL is optional for local work; without `DATABASE_URL`, DevFlow stores data under `DATA_DIR` as JSON.

## Start locally

```sh
npm ci
cp .env.example .env
npm run dev:all
```

This starts the API, web UI, and controlled local test target together. Open `http://localhost:3000`. The API listens on `http://127.0.0.1:4000` and the target on `http://127.0.0.1:5050`. Press Ctrl+C to stop all services.

Create an account in the UI, add `http://127.0.0.1:5050` as a target, and run a small GET `/health` test with 2 virtual users for 5 seconds. Local targets are enabled by default outside production. Never enable them on a public instance.

For a scripted clean-install check, run `bash tools/quickstart-check.sh` (Git Bash or Linux/macOS shell) or `powershell -ExecutionPolicy Bypass -File tools/quickstart-check.ps1` on Windows. It starts local services, saves a target, calls `devflow check`, and prints the regression verdict (normally `insufficient_data` on the first run). Docker packaging is in [Docker deployment](DOCKER.md).
