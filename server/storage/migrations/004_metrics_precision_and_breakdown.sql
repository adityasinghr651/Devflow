-- 004_metrics_precision_and_breakdown.sql: High-precision error_rate, detailed error counters, and engine tracking

ALTER TABLE test_runs
  ALTER COLUMN error_rate TYPE NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS http_error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timeout_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engine VARCHAR(50) DEFAULT 'node',
  ADD COLUMN IF NOT EXISTS partial_workers JSONB,
  ADD COLUMN IF NOT EXISTS histogram_complete BOOLEAN DEFAULT TRUE;

