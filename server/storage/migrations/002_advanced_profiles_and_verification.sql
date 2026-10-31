-- 002_advanced_profiles_and_verification.sql: Workload stages, configurable requests, and domain ownership verification

ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS profile VARCHAR(50) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS headers JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS timeout_ms INTEGER DEFAULT 5000;

