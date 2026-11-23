# DevFlow User Guide

This guide walks through the browser interface from first launch to a repeatable CI performance check. DevFlow is for HTTP APIs that you own or have explicit permission to test. Begin in local development or staging with a harmless read-only endpoint.

## 1. Start DevFlow locally

### Requirements

- Node.js 22.x (or a version listed in `package.json`) and npm.
- Git, if you are cloning the repository.
- PostgreSQL is optional. The default local setup saves data as JSON files.

### Launch

From the repository folder:

```bash
npm ci
cp .env.example .env
npm run dev:all
```

On Windows PowerShell, replace the copy command with `Copy-Item .env.example .env`. Open **http://localhost:3000**. The combined command starts the browser UI, API server (`http://127.0.0.1:4000`), and controlled local demo target (`http://127.0.0.1:5050`). Keep the terminal open while using DevFlow; press Ctrl+C there to stop the services.

There is no public hosted DevFlow URL configured by this guide. For a deployment, follow [Operations](OPERATIONS.md), [Docker deployment](DOCKER.md), and the environment template. Never expose a development configuration or local-target access on a public server.

## 2. Sign in and choose where data is saved

Create an account or sign in to save targets and test runs to your account. The demo workspace is for exploring the interface and is read-only; records from a demo session are not your persistent project history. If a save or run action asks you to sign in, use the sign-in button and retry.

By default, a local API with no `DATABASE_URL` stores JSON files under `DATA_DIR` (default: `./data`). Use PostgreSQL for persistent deployment or shared application hosting. See [Database setup](DATABASE_SETUP.md) for Docker/self-hosted Postgres and Supabase instructions. Do not put secrets in browser-visible `VITE_*` values.

## 3. Add and verify an API target

1. Open **API Targets**, then choose **Add Target**.
2. Give the target a recognizable name, such as `Local demo API` or `Staging catalog`.
3. Enter the **base URL only**. For the bundled local target, use `http://127.0.0.1:5050`. Do not include the endpoint path here.
4. Select the matching environment and save.
5. For a remote domain, open its verification instructions and publish the requested DNS TXT record or HTTP challenge. Return to DevFlow and confirm verification.

The test runner is the DevFlow API server, so it must be able to resolve and reach the target. `localhost` and `127.0.0.1` refer to the machine/container running that API, not necessarily your browser. A GitHub-hosted runner cannot reach a service on your laptop through your laptop's loopback address. Use a reachable staging environment for CI.

## 4. Run a first, small test

1. Choose **Run Test** and select the saved target.
2. Enter a route such as `/health`. DevFlow combines it with the target base URL.
3. Choose **GET** for a read-only health route. Avoid state-changing endpoints for a first run.
4. Select **Quick Ping** (5 virtual users for 5 seconds).
5. Confirm the target, route, method, and authorization checkbox, then start the run.
6. Watch **Live Metrics** while it runs. When complete, open the run in **Test Runs** or **History**.

A virtual user (VU) sends requests concurrently. More VUs and more time usually produce more traffic, although the actual request count depends on response speed, pacing, and errors. A short test checks that configuration and connectivity work; it does not prove production capacity. Increase load gradually and coordinate any test that may affect shared systems.

## 5. Understand the results

- **Requests/sec (RPS):** measured throughput during the run.
- **p50 / p95 / p99:** response-time percentiles. For example, p95 is the latency at or below which 95% of measured responses completed.
- **Error rate:** failed requests divided by total requests. Inspect status codes and errors as well as the percentage.
- **Total requests:** number of requests recorded in the run.
- **Progress and live chart:** interim measurements; use the finalized run record for later comparisons.

Open a completed run for its detailed summary. Use **Comparisons** to compare workloads with the same target, route, method, and load settings. Different workloads or environments are not an apples-to-apples comparison. Keep a note of deployments, data state, and background activity when evaluating a change.

## 6. Set up a CI regression check

DevFlow's CLI and GitHub Action compare a new run with recent matching history. Create a stable target and repeat the same workload before relying on a verdict.

1. Follow [CLI setup](CLI.md) and [GitHub Action setup](GITHUB_ACTION.md) for installation and workflow configuration.
2. Create a target reachable from the CI runner. Save the target ID and configure `DEVFLOW_API_URL` and `DEVFLOW_TOKEN` as repository or environment secrets.
3. Configure the workflow to execute the same route, method, duration, and concurrency used by its baseline.
4. Run the workload repeatedly. The regression check needs at least **3 completed matching runs** before it can return a statistical verdict; an initial `insufficient_data` result means it needs more history.
5. Review the pull-request summary and JSON artifact. Investigate both latency and errors before accepting a result.

Current limitations: baseline matching uses the account owner and workload fingerprint; branch-specific isolation is not guaranteed. The hosted CI workflow has not been externally pilot-verified. Treat results as an engineering signal and validate them in your own CI environment before making the gate mandatory.

For pull requests from forks, GitHub does not expose repository secrets to the standard untrusted fork workflow. Do not change the workflow to expose a privileged DevFlow token to untrusted code. See [Security model](SECURITY_MODEL.md).

## 7. Select a database

- **Local JSON (default):** no database setup required; data is stored under `DATA_DIR` on the API host.
- **Docker or self-hosted PostgreSQL:** set `DATABASE_URL` for the API process. See [Database setup](DATABASE_SETUP.md).
- **Supabase:** use the connection string suited to the deployment and set `DB_SSL=true`. Keep the database password in the server environment; never in frontend variables or Git.

If the API runs in Docker, its `DATA_DIR` or database must use persistent storage or records may be lost when the container is replaced. Back up production data and use a private database network where possible.

## 8. Billing and plan access

Open **Billing & Plans** from the navigation to see the available plan and configured price. If the operator has configured Razorpay, use **Checkout** to complete and verify a payment. The UPI QR path is handled separately and requires administrator review before Pro access is activated. It is a one-time upgrade flow, not recurring subscription billing.

If payment controls are unavailable, the deployment operator needs to configure the server-side Razorpay credentials and `UPGRADE_PLAN_PRICE_INR`. Never share or commit the Razorpay secret. See [Pricing](PRICING.md).

## 9. Common problems

| What you see | What to check |
| --- | --- |
| Target selector is empty | Sign in, save a target under **API Targets**, then reopen the form. |
| Target cannot be reached | Test connectivity from the API host/container. Confirm hostname, port, firewall, TLS, and route. |
| Remote target cannot run | Complete domain ownership verification and confirm it is marked verified. |
| Local URL works in browser but not in runner | `localhost` points to the API host/container. Use the correct host address from that environment. |
| Regression says `insufficient_data` | Record at least three completed runs with the same target and workload fingerprint. |
| Old records disappear after deployment | Configure persistent JSON volume or PostgreSQL and verify backups. |
| Billing is missing | Confirm server payment variables and the enabled plan configuration; restart/redeploy after changing environment values. |

See [Troubleshooting](TROUBLESHOOTING.md) and [FAQ](FAQ.md) for more detail. For development and architecture, see [Architecture](ARCHITECTURE.md) and [Concepts](CONCEPTS.md).
