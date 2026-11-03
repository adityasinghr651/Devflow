# Contributing to DevFlow

Thanks for considering a contribution. Small, focused changes are easiest to review and safest to merge.

## Before you start

- Search existing issues and pull requests for related work. For a substantial feature, open an issue first to discuss its scope.
- For bugs, include the steps to reproduce, expected and actual behavior, Node.js version, operating system, and relevant redacted logs.
- Never include passwords, tokens, `.env` files, database exports, or personal data in an issue or pull request.
- Load-test only services you own or have permission to test. Use `tools/test-target.js` for local examples.

## Make a change

```bash
git checkout main
git pull origin main
git checkout -b fix/short-description
npm ci
```

Make one change per branch where practical. Add or update tests when behavior changes, and update the README or `docs/METRICS.md` when setup, API behavior, or metric meaning changes.

Before opening a pull request, run the checks relevant to your change:

```bash
npm test
npm run lint
npm run build
```

For changes to worker execution or telemetry, also run the relevant focused integration test, such as:

```bash
node --test tests/integration/real-run-telemetry.test.js
```

Record any check that you could not run and why. Do not describe an unrun check as passing.

## Commit and open a pull request

Use a short imperative commit subject. Existing examples in this repository use prefixes such as `fix:` and `docs:`.

```bash
git add path/to/changed/files
git commit -m "fix: describe the change"
git push origin fix/short-description
```

Open a pull request against `main`. Explain the problem, the solution, any behavior or configuration changes, and how you verified it. Link the related issue when there is one.

## Pull request checklist

- [ ] The description explains the change and its user impact.
- [ ] A related issue is linked, when applicable.
- [ ] Relevant tests, lint, and build checks were run; results are stated accurately.
- [ ] UI changes include screenshots of the actual running application.
- [ ] Documentation and metric definitions are updated when needed.
- [ ] No secrets, local data, generated output, or unrelated files are included.

## Good first contributions

- Add regression tests for an uncovered validation or runner edge case.
- Improve explanations in the metrics documentation.
- Fix a reproducible UI accessibility or theme issue.
- Improve error messages in local setup or target management.
- Capture and document screenshots from the actual running interface.

The repository does not currently declare a license. Please discuss licensing with the maintainers before contributing work that depends on reuse rights being defined.
