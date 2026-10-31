import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations } from '../../server/storage/migrations/runner.js';

test('Migrations: Runner executes unapplied migrations inside transaction', async () => {
  const executedQueries = [];
  let inTransaction = false;

  const mockClient = {
    async query(sql, params) {
      executedQueries.push({ sql: sql.trim(), params });
      if (sql.includes('SELECT version FROM schema_migrations')) {
        return { rows: [] }; // No migrations applied yet
      }
      if (sql.includes('BEGIN')) {
        inTransaction = true;
      }
      if (sql.includes('COMMIT')) {
        inTransaction = false;
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const newlyApplied = await runMigrations(mockClient);
  assert.ok(newlyApplied.length > 0);
  assert.ok(newlyApplied.includes('001_initial_schema.sql'));

  // Verify transaction wrapping
  const hasBegin = executedQueries.some(q => q.sql === 'BEGIN');
  const hasCommit = executedQueries.some(q => q.sql === 'COMMIT');
  const hasRecord = executedQueries.some(q => q.sql.includes('INSERT INTO schema_migrations'));

  assert.equal(hasBegin, true);
  assert.equal(hasCommit, true);
  assert.equal(hasRecord, true);
});

test('Migrations: Runner rolls back on SQL failure', async () => {
  let rolledBack = false;

  const failingClient = {
    async query(sql, params) {
      if (sql.includes('SELECT version FROM schema_migrations')) {
        return { rows: [] };
      }
      if (sql.includes('ROLLBACK')) {
        rolledBack = true;
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS users')) {
        throw new Error('Simulated syntax error in migration');
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => await runMigrations(failingClient),
    /Simulated syntax error in migration/
  );
  assert.equal(rolledBack, true);
});

