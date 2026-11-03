ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS measurement_window_sec NUMERIC(12, 3);
