ALTER TABLE test_runs DROP CONSTRAINT IF EXISTS test_runs_duration_sec_check;
ALTER TABLE test_runs ADD CONSTRAINT test_runs_duration_sec_check
  CHECK (duration_sec >= 1 AND duration_sec <= 3600);
