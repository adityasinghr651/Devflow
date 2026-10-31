import pg from 'pg';
import { runMigrations } from './migrations/runner.js';

const { Pool } = pg;

function mapTargetFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    url: row.url,
    environment: row.environment,
    verified: Boolean(row.verified),
    verificationToken: row.verification_token || null,
    verificationMethod: row.verification_method || null,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function mapRunFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    targetId: row.target_id,
    targetName: row.target_name,
    url: row.url,
    method: row.method,
    concurrency: Number(row.concurrency),
    durationSec: Number(row.duration_sec),
    profile: row.profile || 'fixed',
    stages: row.stages || [],
    headers: row.headers || {},
    body: row.body || null,
    timeoutMs: Number(row.timeout_ms || 5000),
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : undefined,
    totalRequests: Number(row.total_requests || 0),
    successCount: Number(row.success_count || 0),
    failedCount: Number(row.failed_count || 0),
    rps: Number(Number(row.rps || 0).toFixed(2)),
    p50: Number(Number(row.p50 || 0).toFixed(2)),
    p95: Number(Number(row.p95 || 0).toFixed(2)),
    p99: Number(Number(row.p99 || 0).toFixed(2)),
    errorRate: Number(Number(row.error_rate || 0).toFixed(2)),
    statusCodes: row.status_codes || {},
    error: row.error || undefined,
  };
}

export class PgStorage {
  constructor(connectionString, poolOptions = {}) {
    this.pool = new Pool({
      connectionString,
      max: poolOptions.max || 10,
      min: poolOptions.min || 2,
      idleTimeoutMillis: poolOptions.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: poolOptions.connectionTimeoutMillis || 5000,
    });
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    const client = await this.pool.connect();
    try {
      await runMigrations(client);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  // User management
  async createUser({ email, passwordHash, name, role = 'user' }) {
    await this.init();
    const sql = `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, role, created_at, updated_at
    `;
    const res = await this.pool.query(sql, [email.toLowerCase(), passwordHash, name, role]);
    const u = res.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  async getUserByEmail(email) {
    await this.init();
    const res = await this.pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!res.rows[0]) return null;
    const u = res.rows[0];
    return {
      id: u.id,
      email: u.email,
      passwordHash: u.password_hash,
      name: u.name,
      role: u.role,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  async getUserById(id) {
    await this.init();
    const res = await this.pool.query('SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    const u = res.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  // Target management (scoped to user)
  async getTargets(userId) {
    await this.init();
    const res = await this.pool.query(
      'SELECT * FROM targets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.rows.map(mapTargetFromDb);
  }

  async getTargetById(id, userId = null) {
    await this.init();
    const sql = userId
      ? 'SELECT * FROM targets WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM targets WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const res = await this.pool.query(sql, params);
    return mapTargetFromDb(res.rows[0]);
  }

  async createTarget(target) {
    await this.init();
    const sql = `
      INSERT INTO targets (
        id, user_id, name, url, environment,
        verified, verification_token, verification_method, verified_at,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const res = await this.pool.query(sql, [
      target.id,
      target.userId,
      target.name,
      target.url,
      target.environment || 'Development',
      Boolean(target.verified),
      target.verificationToken || null,
      target.verificationMethod || null,
      target.verifiedAt || null,
      target.createdAt || new Date(),
      target.updatedAt || new Date(),
    ]);
    return mapTargetFromDb(res.rows[0]);
  }

  async updateTarget(id, updates, userId = null) {
    await this.init();
    const fields = [];
    const values = [];
    let idx = 1;

    const mapping = {
      name: 'name',
      url: 'url',
      environment: 'environment',
      verified: 'verified',
      verificationToken: 'verification_token',
      verificationMethod: 'verification_method',
      verifiedAt: 'verified_at',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (updates[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) return await this.getTargetById(id, userId);

    fields.push(`updated_at = NOW()`);
    values.push(id);
    let whereClause = `WHERE id = $${idx++}`;

    if (userId) {
      whereClause += ` AND user_id = $${idx++}`;
      values.push(userId);
    }

    const sql = `UPDATE targets SET ${fields.join(', ')} ${whereClause} RETURNING *`;
    const res = await this.pool.query(sql, values);
    return mapTargetFromDb(res.rows[0]);
  }

  async deleteTarget(id, userId) {
    await this.init();
    const res = await this.pool.query(
      'DELETE FROM targets WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return res.rowCount > 0;
  }

  // Run management (scoped to user)
  async getRuns(userId) {
    await this.init();
    const res = await this.pool.query(
      'SELECT * FROM test_runs WHERE user_id = $1 ORDER BY started_at DESC',
      [userId]
    );
    return res.rows.map(mapRunFromDb);
  }

  async getRunById(id, userId = null) {
    await this.init();
    const sql = userId
      ? 'SELECT * FROM test_runs WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM test_runs WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const res = await this.pool.query(sql, params);
    return mapRunFromDb(res.rows[0]);
  }

  async createRun(run) {
    await this.init();
    const sql = `
      INSERT INTO test_runs (
        id, user_id, target_id, target_name, url, method,
        concurrency, duration_sec, profile, stages, headers, body, timeout_ms,
        status, started_at, total_requests, success_count, failed_count, rps,
        p50, p95, p99, error_rate, status_codes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24
      ) RETURNING *
    `;
    const res = await this.pool.query(sql, [
      run.id,
      run.userId,
      run.targetId,
      run.targetName,
      run.url,
      run.method,
      run.concurrency,
      run.durationSec,
      run.profile || 'fixed',
      JSON.stringify(run.stages || []),
      JSON.stringify(run.headers || {}),
      run.body || null,
      run.timeoutMs || 5000,
      run.status || 'queued',
      run.startedAt || new Date(),
      run.totalRequests || 0,
      run.successCount || 0,
      run.failedCount || 0,
      run.rps || 0,
      run.p50 || 0,
      run.p95 || 0,
      run.p99 || 0,
      run.errorRate || 0,
      JSON.stringify(run.statusCodes || {}),
    ]);
    return mapRunFromDb(res.rows[0]);
  }

  async updateRun(id, updates) {
    await this.init();
    const current = await this.getRunById(id);
    if (!current) return null;

    const fields = [];
    const values = [];
    let idx = 1;

    const mapping = {
      status: 'status',
      finishedAt: 'finished_at',
      totalRequests: 'total_requests',
      successCount: 'success_count',
      failedCount: 'failed_count',
      rps: 'rps',
      p50: 'p50',
      p95: 'p95',
      p99: 'p99',
      errorRate: 'error_rate',
      statusCodes: 'status_codes',
      error: 'error',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (updates[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(key === 'statusCodes' ? JSON.stringify(updates[key]) : updates[key]);
      }
    }

    if (fields.length === 0) return current;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `
      UPDATE test_runs
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const res = await this.pool.query(sql, values);
    return mapRunFromDb(res.rows[0]);
  }

  async deleteRun(id, userId) {
    await this.init();
    const res = await this.pool.query(
      'DELETE FROM test_runs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return res.rowCount > 0;
  }

  // Cleanup runs left in-flight after abrupt server crash/restart
  async cleanupStaleRuns() {
    await this.init();
    const res = await this.pool.query(`
      UPDATE test_runs
      SET status = 'failed',
          error = 'Aborted due to unexpected server restart',
          finished_at = NOW(),
          updated_at = NOW()
      WHERE status IN ('queued', 'validating', 'running')
    `);
    return res.rowCount;
  }

  // Audit event logging
  async createAuditEvent({ userId, action, resourceType, resourceId, details = {}, ipAddress = null }) {
    try {
      await this.init();
      await this.pool.query(
        `INSERT INTO audit_events (user_id, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId || null, action, resourceType || null, resourceId || null, JSON.stringify(details), ipAddress]
      );
    } catch (err) {
      console.warn('[Audit] Failed to record audit event:', err.message);
    }
  }

  getHealthInfo() {
    return {
      storage: 'postgresql',
      poolTotal: this.pool.totalCount,
      poolIdle: this.pool.idleCount,
      poolWaiting: this.pool.waitingCount,
    };
  }
}
