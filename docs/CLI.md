# CLI

The `devflow` binary submits a run to an existing DevFlow API, waits for its final result, and compares it with matching history.

## One-command project check

From a project with a saved DevFlow target, scaffold a starter config once:

```sh
npm link
devflow check --init
```

Set `targetId` in `devflow.config.json` to your saved target ID, then provide the API token through the environment and run:

```sh
export DEVFLOW_TOKEN="<your-token>"
devflow check
```

The check reads `devflow.config.json` by default. It uses `apiUrl` from that file, then `DEVFLOW_API`, then `http://127.0.0.1:4000/api/v1`. `--config`, `--api`, `--token`, `--wait`, and `--json` override the defaults. The config contains workload settings only; do not save tokens in it. `--init` refuses to overwrite an existing file. Use `--json` for machine-readable output.

## Explicit run

```sh
npm link
devflow run --config examples/devflow.config.json --api https://devflow.example/api/v1 --token "$DEVFLOW_TOKEN" --wait 120 --json
```

Configuration requires `targetId`, integer `concurrency`, and integer `durationSec`; it accepts the normal run fields such as `path`, `method`, `workerCount`, `headers`, `body`, and `assertions`. Create and verify the target in DevFlow first. The API enforces the instance's quotas and target safety rules.

Exit codes: `0` completed with no failed requests/assertions and no regression; `1` regression, request/assertion failure, or non-completed terminal status; `2` CLI, configuration, network, authorization, or wait error. `--json` emits a machine-readable run and regression report including baseline IDs and bands. At least three comparable completed runs are required for a statistical verdict. See [regression policy](REGRESSION_DETECTION.md). Do not put tokens in committed files or command logs.
