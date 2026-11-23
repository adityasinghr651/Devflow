import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildPoolConfig } from '../../server/storage/postgres-storage.js';

test('Postgres pool enables provider-compatible SSL only when requested', () => {
  const local = buildPoolConfig('postgresql://localhost/devflow', {}, { DB_SSL: 'false' });
  assert.equal(Object.hasOwn(local, 'ssl'), false);
  assert.equal(local.max, 10);
  assert.equal(local.min, 2);

  const explicit = buildPoolConfig('postgresql://db.example/devflow', { max: 4, min: 1 }, { DB_SSL: 'true' });
  assert.deepEqual(explicit.ssl, { rejectUnauthorized: false });
  assert.equal(explicit.max, 4);
  assert.equal(explicit.min, 1);

  const urlConfigured = buildPoolConfig('postgresql://db.example/devflow?sslmode=require', {}, { DB_SSL: 'false' });
  assert.deepEqual(urlConfigured.ssl, { rejectUnauthorized: false });
  assert.equal(new URL(urlConfigured.connectionString).searchParams.has('sslmode'), false);
  const client = new pg.Client(urlConfigured);
  assert.deepEqual(client.connectionParameters.ssl, { rejectUnauthorized: false });
});

test('Postgres pool keeps SSL disabled for the default local connection', () => {
  const config = buildPoolConfig('postgresql://devflow:devflow@127.0.0.1:5432/devflow', {}, {});
  assert.equal(Object.hasOwn(config, 'ssl'), false);
});
