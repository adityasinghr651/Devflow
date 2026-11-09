ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(40) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_runs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
UPDATE users SET lifetime_runs = (SELECT COUNT(*)::int FROM test_runs WHERE test_runs.user_id = users.id) WHERE lifetime_runs = 0;
UPDATE users SET tier='admin', plan='admin' WHERE role='admin';
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_identity_unique ON users (oauth_provider, oauth_provider_id) WHERE oauth_provider IS NOT NULL AND oauth_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_tier ON users (tier);

CREATE TABLE IF NOT EXISTS demo_ip_usage (
  ip_hash CHAR(64) PRIMARY KEY,
  run_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);
