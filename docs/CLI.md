# CLI

The `devflow` binary submits a run to an existing DevFlow API and waits for its final result.

```sh
npm link
devflow run --config examples/devflow.config.json --api https://devflow.example/api/v1 --token "$DEVFLOW_TOKEN" --wait 120 --json
```

Configuration requires `targetId`, integer `concurrency`, and integer `durationSec`; it accepts the normal run fields such as `path`, `method`, `workerCount`, `headers`, `body`, and `assertions`. Create and verify the target in DevFlow first. The API enforces the instance's quotas and target safety rules.

Exit codes: `0` completed with no failed requests or assertions; `1` run completed with request/assertion failures or a non-completed terminal status; `2` CLI, configuration, network, authorization, or wait error. `--json` emits a machine-readable result. Do not put tokens in committed files or command logs.
