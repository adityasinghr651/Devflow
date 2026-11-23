# Database setup

DevFlow supports two storage modes:

- **JSON file storage** is the zero-setup default. Leave `DATABASE_URL` unset and records are written under the configured `DATA_DIR` (normally `./data`).
- **PostgreSQL** is enabled by setting `DATABASE_URL`. The API applies the SQL files in `server/storage/migrations/` at startup.

## Self-hosted or Docker PostgreSQL

### Docker Compose

1. Copy `.env.example` to `.env`.
2. Set a unique `JWT_SECRET` and a strong `POSTGRES_PASSWORD`.
3. Set `CORS_ORIGIN` to the address where the UI will be opened.
4. Start the stack:

   ```sh
   docker compose up --build -d
   ```

The existing Compose file starts PostgreSQL 16 and points the API at the Compose service hostname `postgres`. The API runs migrations at startup, and PostgreSQL data remains in the `postgres_data` volume. The database URL is assembled from `POSTGRES_PASSWORD` in `docker-compose.yml`; local container-to-container Postgres does not need SSL, so leave `DB_SSL` unset or `false`.

See [Docker deployment](./DOCKER.md) for the deployment and security notes.

### Existing local PostgreSQL

Create a database and a role that can create/alter the DevFlow schema, then set a URL such as:

```dotenv
DATABASE_URL=postgresql://devflow:your-password@127.0.0.1:5432/devflow
# DB_SSL is not required for a local non-TLS PostgreSQL server.
```

Keep `.env` out of source control. URL-encode special characters in the username or password.

## Supabase PostgreSQL

Supabase provides a managed PostgreSQL database. The application uses the normal PostgreSQL `pg` driver and the same migrations; no Supabase-specific client or schema is required.

1. Sign in to [Supabase](https://supabase.com/), create a new project, choose a project name and a region near the API deployment, and set a strong database password. The free plan is suitable for development and evaluation; check Supabase's current project limits before relying on it for production.
2. Wait until the database is ready. In the project dashboard, open **Connect** and select a PostgreSQL connection string.
3. Choose the connection type for the deployment:
   - **Direct connection** uses the database host and port directly. Prefer it for an always-on API server with persistent outbound connections and a network that supports the address family required by the project.
   - **Session pooler** uses Supabase's pooler while preserving a session for the lifetime of a client connection. Use it when direct connectivity is unavailable, for example when the deployment network needs the pooler's IPv4 route, or when you want Supabase's session pooling in front of the database. Copy the session-pooler URI from the dashboard rather than changing only its hostname or port.
   - **Transaction pooler** is intended for short-lived/serverless clients that cannot keep sessions. This application keeps a `pg` pool and runs migrations inside transactions, so use a direct or session-pooler URL for the normal deployment path unless you have separately validated the transaction pooler with your deployment and migration lifecycle.
4. Put the copied connection string in the ignored `.env` file and enable TLS:

   ```dotenv
   DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres?sslmode=require
   DB_SSL=true
   ```

   Use the exact URI and port shown by Supabase. A session-pooler URI may use a different username/host/port than the example above. Do not commit `.env` or publish the database password.
5. Start DevFlow normally. On the first API connection, the existing migration runner creates `schema_migrations` and applies pending migration files. Check API startup logs and the health endpoint for a ready database.

The repository's [.env.production.example](../.env.production.example) is a placeholder-only production template. Copy it to a private, ignored `.env` only for a self-managed host, replace every placeholder, and never commit the resulting `.env`. For hosted deployments, prefer the platform's environment/secret manager. Production startup rejects a placeholder JWT secret.

See Supabase's current [PostgreSQL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) for the dashboard steps, endpoint modes, IP-version details, and current SSL recommendations.

### TLS behavior and certificate validation

The pool enables `ssl: { rejectUnauthorized: false }` when `DB_SSL=true` or the URL contains `sslmode=require`. This keeps the PostgreSQL connection encrypted while allowing providers whose certificate chain is not present in Node.js's default trust store; it is a widely used compatibility setting for managed PostgreSQL services.

When `sslmode=require` is present, DevFlow removes that query parameter after detecting it and supplies the explicit `ssl` object. The `pg` connection-string parser can otherwise replace the supplied SSL object with settings inferred from the URL.

`rejectUnauthorized: false` skips certificate-chain and server-identity validation, so it is a compatibility tradeoff rather than the strongest TLS configuration. For production environments where the provider CA is available, prefer configuring that CA and keeping certificate validation enabled. Use TLS only with the trusted provider endpoint, protect the database password, and do not enable this option for a local non-TLS database.

## Migration compatibility

The current SQL migrations use PostgreSQL core features: `UUID`, `gen_random_uuid()`, `JSONB`, `TIMESTAMPTZ`, standard `ALTER TABLE`, `CREATE INDEX`, partial indexes, and transactional DDL. They do not install extensions or call Supabase-only functions. `gen_random_uuid()` is built into supported modern PostgreSQL versions (including the PostgreSQL 16 Docker image used here); no `CREATE EXTENSION` step is required.

Supabase's `postgres` project role can run the current migrations. If you choose another database role, it needs the privileges required to create and alter the application's tables and indexes in the target schema.

## Check the configured pool behavior

The unit test `tests/unit/postgres-ssl.test.js` checks that SSL is enabled for `DB_SSL=true` and `sslmode=require`, and omitted for local PostgreSQL URLs. The existing integration storage tests exercise the JSON-file implementation without a database. Run both with:

```sh
node --test tests/unit/postgres-ssl.test.js tests/integration/storage.test.js
```

This validates local configuration and JSON storage. It does not prove connectivity to a particular Supabase project; a real connection requires that project's database URL and password.
