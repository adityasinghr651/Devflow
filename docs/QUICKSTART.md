# Quickstart

## Requirements

Use Node.js 22.x and npm. PostgreSQL is optional for local work; without `DATABASE_URL`, DevFlow stores data under `DATA_DIR` as JSON.

## Start locally

```sh
npm ci
cp .env.example .env
npm run target
```

In another terminal, run `npm run server`; in a third run `npm run dev`. Open `http://localhost:3000`. The API listens on `http://127.0.0.1:4000`.

Create an account in the UI, add `http://127.0.0.1:5050` as a target, and run a small GET `/health` test with 2 virtual users for 5 seconds. Local targets are enabled by default outside production. Never enable them on a public instance.

For a scripted end-to-end check, run `bash tools/quickstart-check.sh` (Git Bash or Linux/macOS shell). Docker packaging is in [Docker deployment](DOCKER.md).
