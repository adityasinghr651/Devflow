import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const TERMINAL_RUNS = new Set(['completed', 'failed', 'cancelled', 'timed_out']);

function pruneTerminalRuns(draft, userId) {
  const terminal = draft.runs.filter(run => run.userId === userId && TERMINAL_RUNS.has(run.status));
  const excess = new Set(terminal.slice(config.maxRunsStoredPerUser).map(run => run.id));
  if (excess.size) draft.runs = draft.runs.filter(run => !excess.has(run.id));
}

export class JsonStorage {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'store.json');
    this.store = { users: [], targets: [], runs: [], campaigns: [], auditEvents: [], demoIpUsage: {} };
    this.writeQueue = Promise.resolve();
    this.mutationQueue = Promise.resolve();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const content = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(content);
      this.store = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
        demoIpUsage: parsed.demoIpUsage || {},
      };
      for (const user of this.store.users) if (user.lifetimeRuns == null) user.lifetimeRuns = this.store.runs.filter(run => run.userId === user.id).length;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Could not read persisted data at ${this.dataFile}; the existing file was left untouched.`, { cause: err });
      }
      await this._flush(this.store);
    }
    this.initialized = true;
  }

  async _flush(snapshot = this.store) {
    const persist = async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.dataFile}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const backup = `${this.dataFile}.${Date.now()}.${Math.random().toString(36).slice(2)}.bak`;
      const payload = JSON.stringify(snapshot, null, 2);
      await fs.writeFile(tmp, payload, 'utf8');

      let renamed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await fs.rename(tmp, this.dataFile);
          renamed = true;
          break;
        } catch (err) {
          if (err.code === 'EPERM' || err.code === 'EBUSY') {
            await new Promise(r => setTimeout(r, 20 * (attempt + 1)));
          } else {
            throw err;
          }
        }
      }

      if (!renamed) {
        let backedUp = false;
        try {
          await fs.rename(this.dataFile, backup);
          backedUp = true;
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        try {
          await fs.rename(tmp, this.dataFile);
        } catch (err) {
          if (backedUp) await fs.rename(backup, this.dataFile).catch(() => {});
          throw err;
        }
        if (backedUp) await fs.unlink(backup);
      }
    };

    // Keep later writes usable after an earlier disk error, but propagate each
    // failed write to the API operation that requested it.
    const write = this.writeQueue.catch(() => {}).then(persist);
    this.writeQueue = write;
    return write;
  }

  async _commit(change) {
    await this.init();
    const operation = this.mutationQueue.catch(() => {}).then(async () => {
      const draft = structuredClone(this.store);
      const { value, persist = true } = change(draft);
      if (!persist) return value;
      await this._flush(draft);
      this.store = draft;
      return value === undefined ? undefined : structuredClone(value);
    });
    this.mutationQueue = operation;
    return operation;
  }

  // Users
  async createUser({ email, passwordHash, name, role = 'user', tier = 'free', plan = tier, planExpiresAt = null, oauthProvider = null, oauthProviderId = null, demoExpiresAt = null }) {
    return this._commit((draft) => {
      const existing = draft.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) throw new Error('Email already registered.');
      const user = {
        id: randomUUID(), email: email.toLowerCase(), passwordHash, name, role, tier, plan, planExpiresAt, oauthProvider, oauthProviderId, demoExpiresAt, lifetimeRuns: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      draft.users.push(user);
      const { id, email: savedEmail, name: savedName, role: savedRole, tier: savedTier, plan: savedPlan, lifetimeRuns, createdAt, updatedAt } = user;
      return { value: { id, email: savedEmail, name: savedName, role: savedRole, tier: savedTier, plan: savedPlan, lifetimeRuns, createdAt, updatedAt } };
    });
  }

  async createFirstAdmin({ email, passwordHash, name }) {
    return this._commit(draft => {
      if (draft.users.some(user => user.role === 'admin' || user.tier === 'admin')) throw new Error('An administrator already exists; bootstrap is one-time only.');
      if (draft.users.some(user => user.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already registered.');
      const user = { id: randomUUID(), email: email.toLowerCase(), passwordHash, name, role: 'admin', tier: 'admin', plan: 'admin', lifetimeRuns: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.users.push(user);
      const { passwordHash: _hash, ...safe } = user;
      return { value: safe };
    });
  }

  async getUserByEmail(email) {
    await this.init();
    const u = this.store.users.find(user => user.email.toLowerCase() === email.toLowerCase());
    return u ? JSON.parse(JSON.stringify(u)) : null;
  }

  async getUserById(id) {
    await this.init();
    const u = this.store.users.find(user => user.id === id);
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tier: u.tier || (u.role === 'admin' ? 'admin' : 'free'),
      plan: u.plan || (u.role === 'admin' ? 'admin' : 'free'),
      planExpiresAt: u.planExpiresAt || null,
      demoExpiresAt: u.demoExpiresAt || null,
      lifetimeRuns: Number(u.lifetimeRuns || 0),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async listUsers() { await this.init(); return this.store.users.map(({ passwordHash, ...u }) => ({ ...u, tier: u.tier || (u.role === 'admin' ? 'admin' : 'free'), plan: u.plan || (u.role === 'admin' ? 'admin' : 'free') })); }
  async updateUser(id, updates) { return this._commit(draft => { const u = draft.users.find(user => user.id === id); if (!u) return { value: null, persist: false }; Object.assign(u, structuredClone(updates), { updatedAt: new Date().toISOString() }); const { passwordHash, ...safe } = u; return { value: safe }; }); }
  async getPlatformStats() { await this.init(); const visibleUsers = this.store.users.filter(item => item.tier !== 'demo' || Date.parse(item.demoExpiresAt) > Date.now()); const usersByTier = {}; const runsByTier = {}; for (const user of visibleUsers) usersByTier[user.tier || (user.role === 'admin' ? 'admin' : 'free')] = (usersByTier[user.tier || (user.role === 'admin' ? 'admin' : 'free')] || 0) + 1; const visibleUserIds = new Set(visibleUsers.map(user => user.id)); const visibleRuns = this.store.runs.filter(run => visibleUserIds.has(run.userId)); for (const run of visibleRuns) { const owner = visibleUsers.find(user => user.id === run.userId); const tier = owner?.tier || (owner?.role === 'admin' ? 'admin' : 'free'); runsByTier[tier] = (runsByTier[tier] || 0) + 1; } return { totalUsers: Object.values(usersByTier).reduce((sum, value) => sum + value, 0), totalRuns: visibleRuns.length, usersByTier, runsByTier }; }
  async getUserByOAuth(provider, providerId) { await this.init(); const u = this.store.users.find(user => user.oauthProvider === provider && user.oauthProviderId === providerId); return u ? JSON.parse(JSON.stringify(u)) : null; }
  async getDemoIpUsage(ipHash) { await this.init(); const entry = this.store.demoIpUsage[ipHash]; return entry && Date.parse(entry.expiresAt) > Date.now() ? entry.runCount : 0; }
  async cleanupExpiredDemoUsers(now = new Date().toISOString()) { return this._commit(draft => { const expired = new Set(draft.users.filter(user => user.tier === 'demo' && user.demoExpiresAt && Date.parse(user.demoExpiresAt) <= Date.parse(now)).map(user => user.id)); if (!expired.size) return { value: 0, persist: false }; draft.users = draft.users.filter(user => !expired.has(user.id)); draft.targets = draft.targets.filter(target => !expired.has(target.userId)); draft.runs = draft.runs.filter(run => !expired.has(run.userId)); draft.auditEvents = draft.auditEvents.filter(event => !expired.has(event.userId)); draft.demoIpUsage = Object.fromEntries(Object.entries(draft.demoIpUsage).filter(([, usage]) => Date.parse(usage.expiresAt) > Date.parse(now))); return { value: expired.size }; }); }

  // Targets (scoped to userId)
  async getTargets(userId = null) {
    await this.init();
    const filtered = userId
      ? this.store.targets.filter(t => t.userId === userId)
      : this.store.targets;
    return JSON.parse(JSON.stringify(filtered));
  }

  async getTargetById(id, userId = null) {
    await this.init();
    const t = this.store.targets.find(item => item.id === id && (!userId || item.userId === userId));
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }

  async createTarget(target) {
    return this._commit((draft) => {
      const fullTarget = {
        id: target.id || randomUUID(), userId: target.userId, name: target.name, url: target.url,
        environment: target.environment || 'Development', verified: Boolean(target.verified),
        verificationToken: target.verificationToken || null, verificationMethod: target.verificationMethod || null,
        verifiedAt: target.verifiedAt || null, createdAt: target.createdAt || new Date().toISOString(),
        updatedAt: target.updatedAt || new Date().toISOString(),
      };
      draft.targets.unshift(fullTarget);
      return { value: fullTarget };
    });
  }

  async updateTarget(id, updates, userId = null) {
    return this._commit((draft) => {
      const idx = draft.targets.findIndex(t => t.id === id && (!userId || t.userId === userId));
      if (idx === -1) return { value: null, persist: false };
      draft.targets[idx] = { ...draft.targets[idx], ...structuredClone(updates), updatedAt: new Date().toISOString() };
      return { value: draft.targets[idx] };
    });
  }

  async deleteTarget(id, userId = null) {
    return this._commit((draft) => {
      const prevLen = draft.targets.length;
      draft.targets = draft.targets.filter(t => !(t.id === id && (!userId || t.userId === userId)));
      if (draft.targets.length === prevLen) return { value: false, persist: false };
      draft.runs = draft.runs.filter(r => r.targetId !== id);
      return { value: true };
    });
  }

  // Runs (scoped to userId)
  async getRuns(userId = null, { limit = null, offset = 0 } = {}) {
    await this.init();
    const filtered = userId
      ? this.store.runs.filter(r => r.userId === userId)
      : this.store.runs;
    return JSON.parse(JSON.stringify(limit == null ? filtered : filtered.slice(offset, offset + limit)));
  }
  async countRuns(userId = null) { await this.init(); return userId ? this.store.runs.filter(run => run.userId === userId).length : this.store.runs.length; }

  async getRunById(id, userId = null) {
    await this.init();
    const r = this.store.runs.find(item => item.id === id && (!userId || item.userId === userId));
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  async createRun(run, { quotaLimit = Infinity, demoIpHash = null } = {}) {
    return this._commit((draft) => {
      const user = draft.users.find(item => item.id === run.userId);
      if (user && Number.isFinite(quotaLimit) && (user.lifetimeRuns || 0) >= quotaLimit) return { value: null, persist: false };
      if (user && user.tier === 'demo' && demoIpHash) {
        const ipEntry = draft.demoIpUsage[demoIpHash];
        if (ipEntry && Date.parse(ipEntry.expiresAt) > Date.now() && ipEntry.runCount >= 10) return { value: null, persist: false };
        draft.demoIpUsage[demoIpHash] = { runCount: (ipEntry && Date.parse(ipEntry.expiresAt) > Date.now() ? ipEntry.runCount : 0) + 1, expiresAt: user.demoExpiresAt || new Date(Date.now() + 86400000).toISOString() };
      }
      if (user) user.lifetimeRuns = (user.lifetimeRuns || 0) + 1;
      const fullRun = {
        ...run, id: run.id || randomUUID(), httpErrorCount: run.httpErrorCount ?? 0,
        timeoutCount: run.timeoutCount ?? 0, networkErrorCount: run.networkErrorCount ?? 0,
        redirectBlockedCount: run.redirectBlockedCount ?? 0, measurementWindowSec: run.measurementWindowSec ?? null,
        cancelledCount: run.cancelledCount ?? 0, engine: run.engine || 'node',
        assertions: run.assertions || undefined, assertionFailureCount: run.assertionFailureCount ?? 0,
        environmentMetadata: run.environmentMetadata || undefined,
        errorRate: run.errorRate !== undefined ? Number(Number(run.errorRate).toFixed(4)) : 0,
        createdAt: run.createdAt || new Date().toISOString(), updatedAt: run.updatedAt || new Date().toISOString(),
      };
      draft.runs.unshift(fullRun);
      pruneTerminalRuns(draft, fullRun.userId);
      return { value: fullRun };
    });
  }

  async updateRun(id, updates) {
    return this._commit((draft) => {
      const idx = draft.runs.findIndex(r => r.id === id);
      if (idx === -1) return { value: null, persist: false };
      const cleanUpdates = structuredClone(updates);
      if (cleanUpdates.errorRate !== undefined) cleanUpdates.errorRate = Number(Number(cleanUpdates.errorRate).toFixed(4));
      draft.runs[idx] = { ...draft.runs[idx], ...cleanUpdates, updatedAt: new Date().toISOString() };
      if (TERMINAL_RUNS.has(draft.runs[idx].status)) pruneTerminalRuns(draft, draft.runs[idx].userId);
      return { value: draft.runs[idx] };
    });
  }

  async deleteRun(id, userId = null) {
    return this._commit((draft) => {
      const prevLen = draft.runs.length;
      draft.runs = draft.runs.filter(r => !(r.id === id && (!userId || r.userId === userId)));
      return draft.runs.length === prevLen ? { value: false, persist: false } : { value: true };
    });
  }

  async cleanupStaleRuns() {
    return this._commit((draft) => {
      let cleaned = 0;
      for (const run of draft.runs) {
        if (['queued', 'validating', 'running', 'cancelling'].includes(run.status)) {
          run.status = 'failed';
          run.error = 'Aborted due to unexpected server restart';
          run.finishedAt = new Date().toISOString();
          run.updatedAt = new Date().toISOString();
          cleaned++;
        }
      }
      return { value: cleaned, persist: cleaned > 0 };
    });
  }

  async createAuditEvent({ userId, action, resourceType, resourceId, details = {}, ipAddress = null }) {
    return this._commit((draft) => {
      const event = {
        id: randomUUID(), userId: userId || null, action, resourceType: resourceType || null,
        resourceId: resourceId || null, details: structuredClone(details), ipAddress,
        createdAt: new Date().toISOString(),
      };
      draft.auditEvents.push(event);
      return { value: event };
    });
  }

  async getAuditEvents(userId, limit = 100) {
    await this.init();
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    return JSON.parse(JSON.stringify(this.store.auditEvents
      .filter(event => event.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit)));
  }

  async createCampaign(campaign) {
    return this._commit(draft => {
      const saved = { ...structuredClone(campaign), createdAt: campaign.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      draft.campaigns.unshift(saved);
      return { value: saved };
    });
  }

  async getCampaigns(userId = null) {
    await this.init();
    return structuredClone(userId ? this.store.campaigns.filter(campaign => campaign.userId === userId) : this.store.campaigns);
  }

  async getCampaignById(id, userId = null) {
    await this.init();
    const campaign = this.store.campaigns.find(item => item.id === id && (!userId || item.userId === userId));
    return campaign ? structuredClone(campaign) : null;
  }

  async updateCampaign(id, updates, userId = null) {
    return this._commit(draft => {
      const index = draft.campaigns.findIndex(item => item.id === id && (!userId || item.userId === userId));
      if (index < 0) return { value: null, persist: false };
      draft.campaigns[index] = { ...draft.campaigns[index], ...structuredClone(updates), updatedAt: new Date().toISOString() };
      return { value: draft.campaigns[index] };
    });
  }

  async cleanupStaleCampaigns() {
    return this._commit(draft => {
      let cleaned = 0;
      for (const campaign of draft.campaigns) {
        if (campaign.status === 'running' || campaign.status === 'validating') {
          campaign.status = 'failed';
          campaign.error = 'Campaign interrupted by a server restart; inspect the persisted stage run before retrying.';
          const stage = campaign.stages?.find(item => ['running', 'validating'].includes(item.status));
          if (stage) { stage.status = 'failed'; stage.error = campaign.error; }
          campaign.updatedAt = new Date().toISOString();
          cleaned++;
        }
      }
      return { value: cleaned, persist: cleaned > 0 };
    });
  }

  getHealthInfo() {
    return {
      storage: 'local-json',
      healthy: true,
      path: this.dataFile,
      usersCount: this.store.users.length,
      targetsCount: this.store.targets.length,
      runsCount: this.store.runs.length,
    };
  }

  async close() {
    await this.mutationQueue.catch(() => {});
    await this.writeQueue.catch(() => {});
  }
}
