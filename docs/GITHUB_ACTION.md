# GitHub Action

The composite Action runs the DevFlow CLI against an existing API. Store `DEVFLOW_API_URL` and `DEVFLOW_TOKEN` as repository or environment secrets. Grant `pull-requests: write` if you want the Action to maintain its result comment.

```yaml
- uses: adityasinghr651/Devflow@main
  with:
    api-url: ${{ secrets.DEVFLOW_API_URL }}
    token: ${{ secrets.DEVFLOW_TOKEN }}
    config: examples/devflow.config.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

It runs the configured workload, compares it with matching history, uploads `devflow-result.json`, and creates or updates one PR comment. Hosted runners and shared targets introduce noise; use a stable dedicated target, repeat unexpected measurements, and treat small changes as inconclusive. Do not expose a production token to untrusted fork pull requests.

For a copy-paste workflow, see [the GitHub Action quickstart](../examples/github-action-quickstart.yml). The maintained comment states the verdict, number of comparable runs and minimum, per-metric decision bands, and a direct link to the uploaded JSON artifact. The Action behavior is covered by mocked GitHub API tests; it has not yet been run in an approved external pilot repository.
