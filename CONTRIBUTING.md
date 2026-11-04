# Contributing

Use Node.js 22.x. Fork or branch from the configured project branch, install with `npm ci`, and keep changes focused. Before opening a pull request, run `npm run lint`, `npm run build`, `npm test`, and `node tools/check-doc-links.js`; for end-to-end local workflow changes also run `bash tools/quickstart-check.sh`. Describe behavior changes, configuration impact, verification commands, and any platform-specific gaps. Do not commit `.env`, tokens, database files, or generated benchmark output unless a task specifically needs the artifact.

Please use the issue templates for bugs and feature proposals. Changes must follow the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).
