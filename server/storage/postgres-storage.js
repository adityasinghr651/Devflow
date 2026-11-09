import pg from 'pg';
import { runMigrations } from './migrations/runner.js';
import { config } from '../config.js';

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
    requestTarget: row.request_target == null ? null : Number(row.request_target),
    warmupSec: Number(row.warmup_sec || 0),
    rampUpSec: Number(row.ramp_up_sec || 0),
    warmupRequests: Number(row.warmup_requests || 0),
    histogramSampleCount: Number(row.histogram_sample_count || 0),
    campaignId: row.campaign_id || null,
    campaignStage: row.campaign_stage == null ? null : Number(row.campaign_stage),
    profile: row.profile || 'fixed',
    stages: row.stages || [],
    headers: row.headers || {},
    body: row.body || null,
    timeoutMs: Number(row.timeout_ms || 5000),
    workerCount: Number(row.worker_count || 1),
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : undefined,
    totalRequests: Number(row.total_requests || 0),
    successCount: Number(row.success_count || 0),
    failedCount: Number(row.failed_count || 0),
    httpErrorCount: Number(row.http_error_count || 0),
    timeoutCount: Number(row.timeout_count || 0),
    networkErrorCount: Number(row.network_error_count || 0),
    redirectBlockedCount: Number(row.redirect_blocked_count || 0),
    measurementWindowSec: row.measurement_window_sec == null ? null : Number(row.measurement_window_sec),
    cancelledCount: Number(row.cancelled_count || 0),
    engine: row.engine || 'node',
    assertions: row.assertions || undefined,
    assertionFailureCount: Number(row.assertion_failure_count || 0),
    environmentMetadata: row.environment_metadata || undefined,
    partialWorkers: row.partial_workers || undefined,
    histogramComplete: row.histogram_complete ?? true,
    rps: Number(Number(row.rps || 0).toFixed(2)),
    p50: Number(Number(row.p50 || 0).toFixed(2)),
    p95: Number(Number(row.p95 || 0).toFixed(2)),
    p99: Number(Number(row.p99 || 0).toFixed(2)),
    minLatency: row.min_latency == null ? null : Number(row.min_latency),
    maxLatency: row.max_latency == null ? null : Number(row.max_latency),
    meanLatency: row.mean_latency == null ? null : Number(row.mean_latency),
    errorRate: Number(Number(row.error_rate || 0).toFixed(4)),
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
  async createUser({ email, passwordHash, name, role = 'user', tier = 'free', plan = tier, planExpiresAt = null, oauthProvider = null, oauthProviderId = null, demoExpiresAt = null }) {
    await this.init();
    const sql = `
      INSERT INTO users (email, password_hash, name, role, tier, plan, plan_expires_at, oauth_provider, oauth_provider_id, demo_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, name, role, tier, plan, lifetime_runs, created_at, updated_at
    `;
    const res = await this.pool.query(sql, [email.toLowerCase(), passwordHash, name, role, tier, plan, planExpiresAt, oauthProvider, oauthProviderId, demoExpiresAt]);
    const u = res.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tier: u.tier, plan: u.plan, lifetimeRuns: Number(u.lifetime_runs || 0),
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  async createFirstAdmin({ email, passwordHash, name }) {
    await this.init(); const client=await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtext('devflow-first-admin'))");
      const existing=await client.query("SELECT 1 FROM users WHERE role='admin' OR tier='admin' LIMIT 1");
      if(existing.rowCount) throw new Error('An administrator already exists; bootstrap is one-time only.');
      const result=await client.query("INSERT INTO users(email,password_hash,name,role,tier,plan) VALUES($1,$2,$3,'admin','admin','admin') RETURNING id,email,name,role,tier,plan,lifetime_runs,created_at,updated_at",[email.toLowerCase(),passwordHash,name]);
      await client.query('COMMIT'); const u=result.rows[0]; return {id:u.id,email:u.email,name:u.name,role:u.role,tier:u.tier,plan:u.plan,lifetimeRuns:Number(u.lifetime_runs||0),createdAt:u.created_at.toISOString(),updatedAt:u.updated_at.toISOString()};
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; } finally { client.release(); }
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
      tier: u.tier || (u.role === 'admin' ? 'admin' : 'free'),
      plan: u.plan || 'free',
      oauthProvider: u.oauth_provider || null,
      oauthProviderId: u.oauth_provider_id || null,
      lifetimeRuns: Number(u.lifetime_runs || 0),
      planExpiresAt: u.plan_expires_at?.toISOString() || null,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  async listUsers() { await this.init(); const result = await this.pool.query('SELECT id,email,name,role,tier,plan,plan_expires_at,lifetime_runs,created_at,updated_at FROM users ORDER BY created_at DESC'); return result.rows.map(u => ({ id:u.id,email:u.email,name:u.name,role:u.role,tier:u.tier,plan:u.plan,planExpiresAt:u.plan_expires_at?.toISOString()||null,lifetimeRuns:Number(u.lifetime_runs||0),createdAt:u.created_at.toISOString(),updatedAt:u.updated_at.toISOString() })); }
  async updateUser(id, updates) { await this.init(); const columns = { role:'role',tier:'tier',plan:'plan',planExpiresAt:'plan_expires_at' }; const entries = Object.entries(updates).filter(([key]) => columns[key]); if (!entries.length) return this.getUserById(id); const sets = entries.map(([key], i) => `${columns[key]}=$${i+2}`).join(', '); const result = await this.pool.query(`UPDATE users SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING id,email,name,role,tier,plan,plan_expires_at,lifetime_runs,created_at,updated_at`, [id,...entries.map(([,v])=>v)]); const u=result.rows[0]; return u?{id:u.id,email:u.email,name:u.name,role:u.role,tier:u.tier,plan:u.plan,planExpiresAt:u.plan_expires_at?.toISOString()||null,lifetimeRuns:Number(u.lifetime_runs||0),createdAt:u.created_at.toISOString(),updatedAt:u.updated_at.toISOString()}:null; }
  async getPlatformStats() { await this.init(); const result = await this.pool.query(`SELECT (SELECT COUNT(*)::int FROM users WHERE tier <> 'demo' OR demo_expires_at>NOW()) total_users,(SELECT COUNT(*)::int FROM test_runs r JOIN users u ON u.id=r.user_id WHERE u.tier <> 'demo' OR u.demo_expires_at>NOW()) total_runs,(SELECT COALESCE(jsonb_object_agg(tier,cnt),'{}'::jsonb) FROM (SELECT u.tier,COUNT(r.id)::int cnt FROM users u LEFT JOIN test_runs r ON r.user_id=u.id WHERE u.tier <> 'demo' OR u.demo_expires_at>NOW() GROUP BY u.tier) t) runs_by_tier,(SELECT COALESCE(jsonb_object_agg(tier,cnt),'{}'::jsonb) FROM (SELECT tier,COUNT(*)::int cnt FROM users WHERE tier <> 'demo' OR demo_expires_at>NOW() GROUP BY tier) t) users_by_tier`); const r=result.rows[0]; return {totalUsers:r.total_users,totalRuns:r.total_runs,runsByTier:r.runs_by_tier,usersByTier:r.users_by_tier}; }
  async getUserByOAuth(provider, providerId) { await this.init(); const result=await this.pool.query('SELECT * FROM users WHERE oauth_provider=$1 AND oauth_provider_id=$2',[provider,providerId]); const u=result.rows[0]; return u?{id:u.id,email:u.email,passwordHash:u.password_hash,name:u.name,role:u.role,tier:u.tier,plan:u.plan,oauthProvider:u.oauth_provider,oauthProviderId:u.oauth_provider_id}:null; }
  async getDemoIpUsage(ipHash) { await this.init(); const result=await this.pool.query('SELECT run_count FROM demo_ip_usage WHERE ip_hash=$1 AND expires_at>NOW()',[ipHash]); return Number(result.rows[0]?.run_count||0); }
  async cleanupExpiredDemoUsers(now = new Date().toISOString()) { await this.init(); const client=await this.pool.connect(); try { await client.query('BEGIN'); await client.query("DELETE FROM audit_events WHERE user_id IN (SELECT id FROM users WHERE tier='demo' AND demo_expires_at <= $1)",[now]); const result=await client.query("DELETE FROM users WHERE tier='demo' AND demo_expires_at <= $1",[now]); await client.query('DELETE FROM demo_ip_usage WHERE expires_at <= $1',[now]); await client.query('COMMIT'); return result.rowCount; } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; } finally { client.release(); } }

  async getUserById(id) {
    await this.init();
    const res = await this.pool.query('SELECT id, email, name, role, tier, plan, plan_expires_at, demo_expires_at, lifetime_runs, created_at, updated_at FROM users WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    const u = res.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tier: u.tier || (u.role === 'admin' ? 'admin' : 'free'),
      plan: u.plan || (u.role === 'admin' ? 'admin' : 'free'),
      planExpiresAt: u.plan_expires_at?.toISOString() || null,
      demoExpiresAt: u.demo_expires_at?.toISOString() || null,
      lifetimeRuns: Number(u.lifetime_runs || 0),
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
  async getRuns(userId, { limit = null, offset = 0 } = {}) {
    await this.init();
    const res = limit == null
      ? await this.pool.query('SELECT * FROM test_runs WHERE user_id = $1 ORDER BY started_at DESC', [userId])
      : await this.pool.query('SELECT * FROM test_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows.map(mapRunFromDb);
  }
  async countRuns(userId) { await this.init(); const result=await this.pool.query('SELECT COUNT(*)::int AS total FROM test_runs WHERE user_id=$1',[userId]); return result.rows[0].total; }

  async getRunById(id, userId = null) {
    await this.init();
    const sql = userId
      ? 'SELECT * FROM test_runs WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM test_runs WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const res = await this.pool.query(sql, params);
    return mapRunFromDb(res.rows[0]);
  }

  async createRun(run, { quotaLimit = Infinity, demoIpHash = null } = {}) {
    await this.init();
    const client = await this.pool.connect();
    let createdRun;
    await client.query('BEGIN');
    try {
      const quotaResult = await client.query('UPDATE users SET lifetime_runs=lifetime_runs+1 WHERE id=$1 AND ($2::integer IS NULL OR lifetime_runs < $2) RETURNING tier,demo_expires_at', [run.userId, Number.isFinite(quotaLimit) ? quotaLimit : null]);
      if (!quotaResult.rowCount) { await client.query('ROLLBACK'); return null; }
      if (quotaResult.rows[0].tier === 'demo' && demoIpHash) {
        const ipResult = await client.query(`INSERT INTO demo_ip_usage(ip_hash,run_count,expires_at) VALUES($1,1,$2) ON CONFLICT(ip_hash) DO UPDATE SET run_count=CASE WHEN demo_ip_usage.expires_at>NOW() THEN demo_ip_usage.run_count+1 ELSE 1 END,expires_at=EXCLUDED.expires_at RETURNING run_count`, [demoIpHash, quotaResult.rows[0].demo_expires_at]);
        if (ipResult.rows[0].run_count > 10) { await client.query('ROLLBACK'); return null; }
      }
    const sql = `
      INSERT INTO test_runs (
        id, user_id, target_id, target_name, url, method,
        concurrency, duration_sec, profile, stages, headers, body, timeout_ms,
        worker_count, status, started_at, total_requests, success_count, failed_count,
        http_error_count, timeout_count, network_error_count, redirect_blocked_count, cancelled_count,
        engine, partial_workers, histogram_complete,
        rps, p50, p95, p99, error_rate, status_codes, measurement_window_sec,
        assertions, assertion_failure_count, environment_metadata,
        request_target, warmup_sec, ramp_up_sec, warmup_requests, histogram_sample_count, campaign_id, campaign_stage,
        min_latency, max_latency, mean_latency
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
        $38, $39, $40, $41, $42, $43, $44, $45, $46, $47
      ) RETURNING *
    `;
    createdRun = await client.query(sql, [
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
      run.workerCount || 1,
      run.status || 'queued',
      run.startedAt || new Date(),
      run.totalRequests || 0,
      run.successCount || 0,
      run.failedCount || 0,
      run.httpErrorCount || 0,
      run.timeoutCount || 0,
      run.networkErrorCount || 0,
      run.redirectBlockedCount || 0,
      run.cancelledCount || 0,
      run.engine || 'node',
      run.partialWorkers ? JSON.stringify(run.partialWorkers) : null,
      run.histogramComplete ?? true,
      run.rps || 0,
      run.p50 || 0,
      run.p95 || 0,
      run.p99 || 0,
      run.errorRate || 0,
      JSON.stringify(run.statusCodes || {}),
      run.measurementWindowSec ?? null,
      run.assertions ? JSON.stringify(run.assertions) : null,
      run.assertionFailureCount || 0,
      run.environmentMetadata ? JSON.stringify(run.environmentMetadata) : null,
      run.requestTarget ?? null,
      run.warmupSec || 0,
      run.rampUpSec || 0,
      run.warmupRequests || 0,
      run.histogramSampleCount || 0,
      run.campaignId || null,
      run.campaignStage ?? null,
      run.minLatency ?? null,
      run.maxLatency ?? null,
      run.meanLatency ?? null,
    ]);
    await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(()=>{}); if (error.code === '23505') throw new Error('Email already registered.'); throw error; } finally { client.release(); }
    await this.pool.query(`DELETE FROM test_runs WHERE user_id = $1 AND id IN (
      SELECT id FROM test_runs WHERE user_id = $1 AND status IN ('completed', 'failed', 'cancelled', 'timed_out')
      ORDER BY started_at DESC OFFSET $2
    )`, [run.userId, config.maxRunsStoredPerUser]);
    return mapRunFromDb(createdRun.rows[0]);
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
      warmupRequests: 'warmup_requests',
      histogramSampleCount: 'histogram_sample_count',
      minLatency: 'min_latency',
      maxLatency: 'max_latency',
      meanLatency: 'mean_latency',
      totalRequests: 'total_requests',
      successCount: 'success_count',
      failedCount: 'failed_count',
      httpErrorCount: 'http_error_count',
      timeoutCount: 'timeout_count',
      networkErrorCount: 'network_error_count',
      redirectBlockedCount: 'redirect_blocked_count',
      measurementWindowSec: 'measurement_window_sec',
      assertions: 'assertions',
      assertionFailureCount: 'assertion_failure_count',
      environmentMetadata: 'environment_metadata',
      cancelledCount: 'cancelled_count',
      engine: 'engine',
      partialWorkers: 'partial_workers',
      histogramComplete: 'histogram_complete',
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
        if (['statusCodes', 'partialWorkers', 'assertions', 'environmentMetadata'].includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
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
    const updated = mapRunFromDb(res.rows[0]);
    if (updated && ['completed', 'failed', 'cancelled', 'timed_out'].includes(updated.status)) {
      await this.pool.query(`DELETE FROM test_runs WHERE user_id = $1 AND id IN (
        SELECT id FROM test_runs WHERE user_id = $1 AND status IN ('completed', 'failed', 'cancelled', 'timed_out')
        ORDER BY started_at DESC OFFSET $2
      )`, [updated.userId, config.maxRunsStoredPerUser]);
    }
    return updated;
  }

  async deleteRun(id, userId) {
    await this.init();
    const res = userId
      ? await this.pool.query('DELETE FROM test_runs WHERE id = $1 AND user_id = $2', [id, userId])
      : await this.pool.query('DELETE FROM test_runs WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  async createCampaign(campaign) {
    await this.init();
    const result = await this.pool.query(
      `INSERT INTO benchmark_campaigns (id, user_id, document) VALUES ($1, $2, $3) RETURNING document`,
      [campaign.id, campaign.userId, JSON.stringify(campaign)],
    );
    return result.rows[0].document;
  }

  async getCampaigns(userId) {
    await this.init();
    const result = userId
      ? await this.pool.query('SELECT document FROM benchmark_campaigns WHERE user_id = $1 ORDER BY created_at DESC', [userId])
      : await this.pool.query('SELECT document FROM benchmark_campaigns ORDER BY created_at DESC');
    return result.rows.map(row => row.document);
  }

  async getCampaignById(id, userId = null) {
    await this.init();
    const result = userId
      ? await this.pool.query('SELECT document FROM benchmark_campaigns WHERE id = $1 AND user_id = $2', [id, userId])
      : await this.pool.query('SELECT document FROM benchmark_campaigns WHERE id = $1', [id]);
    return result.rows[0]?.document || null;
  }

  async updateCampaign(id, updates, userId = null) {
    await this.init();
    const current = await this.getCampaignById(id, userId);
    if (!current) return null;
    const document = { ...current, ...structuredClone(updates), updatedAt: new Date().toISOString() };
    const result = await this.pool.query(
      `UPDATE benchmark_campaigns SET document = $1, updated_at = NOW() WHERE id = $2${userId ? ' AND user_id = $3' : ''} RETURNING document`,
      userId ? [JSON.stringify(document), id, userId] : [JSON.stringify(document), id],
    );
    return result.rows[0]?.document || null;
  }

  async cleanupStaleCampaigns() {
    await this.init();
    const campaigns = await this.getCampaigns();
    let cleaned = 0;
    for (const campaign of campaigns) {
      if (!['running', 'validating'].includes(campaign.status)) continue;
      const stage = campaign.stages?.[campaign.currentStage];
      if (stage && ['running', 'validating'].includes(stage.status)) {
        stage.status = 'failed';
        stage.error = 'Campaign interrupted by a server restart.';
      }
      campaign.status = 'failed';
      campaign.error = 'Campaign interrupted by a server restart.';
      await this.updateCampaign(campaign.id, campaign, campaign.userId);
      cleaned++;
    }
    return cleaned;
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
      WHERE status IN ('queued', 'validating', 'running', 'cancelling')
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

  async getAuditEvents(userId, limit = 100) {
    await this.init();
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await this.pool.query(
      `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, created_at
       FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, boundedLimit],
    );
    return result.rows.map(row => ({
      id: row.id, userId: row.user_id, action: row.action,
      resourceType: row.resource_type, resourceId: row.resource_id,
      details: row.details || {}, ipAddress: row.ip_address,
      createdAt: row.created_at.toISOString(),
    }));
  }

  getHealthInfo() {
    return {
      storage: 'postgresql',
      poolTotal: this.pool.totalCount,
      poolIdle: this.pool.idleCount,
      poolWaiting: this.pool.waitingCount,
    };
  }

  async checkHealth() {
    await this.pool.query('SELECT 1');
    return true;
  }
}
