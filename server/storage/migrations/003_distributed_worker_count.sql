-- 003_distributed_worker_count.sql: Distributed load testing worker count
ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS worker_count INTEGER DEFAULT 1;

