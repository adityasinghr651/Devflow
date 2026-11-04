# FAQ

### How does DevFlow differ from k6?

DevFlow is a self-hosted application with saved targets, user-scoped run history, a dashboard, and a local Node child-process runner. k6 is a separate load-testing tool with its own scripting model and runtime. DevFlow's optional k6 adapter does not expose all Node runner failure categories. Neither result is automatically comparable across machines or workload definitions.

### Does “worker” mean a separate server?

No. Workers are child processes on the same host. Multi-machine execution is not implemented.

### Is PostgreSQL required?

No for local development. JSON storage is the fallback. Compose uses PostgreSQL.

### Can I run this against any URL?

Only targets you are authorized to test. Production defaults reject local/private destinations and apply DNS checks and quotas.
