# GitHub Action

The composite Action runs the DevFlow CLI against an existing API. Store `DEVFLOW_API_URL` and `DEVFLOW_TOKEN` as repository or environment secrets and grant `pull-requests: write` only if you want the Action to maintain its summary comment.

```yaml
- uses: adityasinghr651/Devflow@main
  with:
    api-url: ${{ secrets.DEVFLOW_API_URL }}
    token: ${{ secrets.DEVFLOW_TOKEN }}
    config: examples/devflow.config.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

It uploads `devflow-result.json` and creates or updates one PR comment. Baseline comparisons are not automatic. Hosted runners and shared targets introduce noise; use a stable dedicated target, repeat measurements, and treat small changes as inconclusive. Do not expose a production token to untrusted fork pull requests.
