import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(clientOrPool) {
  // Ensure schema_migrations table exists
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRes = await clientOrPool.query('SELECT version FROM schema_migrations ORDER BY version ASC');
  const applied = new Set(appliedRes.rows.map(r => r.version));

  const files = await fs.readdir(__dirname);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  const newlyApplied = [];

  for (const file of sqlFiles) {
    if (applied.has(file)) continue;

    const fullPath = path.join(__dirname, file);
    const sql = await fs.readFile(fullPath, 'utf8');

    const client = typeof clientOrPool.connect === 'function' && clientOrPool.totalCount !== undefined
      ? await clientOrPool.connect()
      : clientOrPool;

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      if (client !== clientOrPool && typeof client.release === 'function') {
        client.release();
      }
    }
  }

  return newlyApplied;
}

