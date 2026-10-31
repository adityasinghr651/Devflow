import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JsonStorage {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'store.json');
    this.store = { users: [], targets: [], runs: [], auditEvents: [] };
    this.writeQueue = Promise.resolve();
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
        auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[Storage] Warning: Failed to parse ${this.dataFile}, creating fresh store:`, err.message);
      }
      await this._flush();
    }
    this.initialized = true;
  }

  async _flush() {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.dataFile}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const payload = JSON.stringify(this.store, null, 2);
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
        await fs.writeFile(this.dataFile, payload, 'utf8');
        await fs.unlink(tmp).catch(() => {});
      }
    }).catch(err => {
      console.error('[Storage] Error persisting to store.json:', err);
    });
    return this.writeQueue;
  }

  // Users
  async createUser({ email, passwordHash, name, role = 'user' }) {
    await this.init();
    const existing = this.store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('Email already registered.');
    }
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.users.push(user);
    await this._flush();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

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
    await this.init();
    const fullTarget = {
      id: target.id || randomUUID(),
      userId: target.userId,
      name: target.name,
      url: target.url,
      environment: target.environment || 'Development',
      verified: Boolean(target.verified),
      verificationToken: target.verificationToken || null,
      verificationMethod: target.verificationMethod || null,
      verifiedAt: target.verifiedAt || null,
      createdAt: target.createdAt || new Date().toISOString(),
      updatedAt: target.updatedAt || new Date().toISOString(),
    };
    this.store.targets.unshift(fullTarget);
    await this._flush();
    return JSON.parse(JSON.stringify(fullTarget));
  }

  async updateTarget(id, updates, userId = null) {
    await this.init();
    const idx = this.store.targets.findIndex(t => t.id === id && (!userId || t.userId === userId));
    if (idx === -1) return null;
    this.store.targets[idx] = {
      ...this.store.targets[idx],
      ...JSON.parse(JSON.stringify(updates)),
      updatedAt: new Date().toISOString(),
    };
    await this._flush();
    return JSON.parse(JSON.stringify(this.store.targets[idx]));
  }

  async deleteTarget(id, userId = null) {
    await this.init();
    const prevLen = this.store.targets.length;
    this.store.targets = this.store.targets.filter(t => !(t.id === id && (!userId || t.userId === userId)));
    if (this.store.targets.length === prevLen) {
      return false;
    }
    // Cascade delete target's runs
    this.store.runs = this.store.runs.filter(r => r.targetId !== id);
    await this._flush();
    return true;
  }

  // Runs (scoped to userId)
  async getRuns(userId = null) {
    await this.init();
    const filtered = userId
      ? this.store.runs.filter(r => r.userId === userId)
      : this.store.runs;
    return JSON.parse(JSON.stringify(filtered));
  }

  async getRunById(id, userId = null) {
    await this.init();
    const r = this.store.runs.find(item => item.id === id && (!userId || item.userId === userId));
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  async createRun(run) {
    await this.init();
    const fullRun = {
      ...run,
      id: run.id || randomUUID(),
      createdAt: run.createdAt || new Date().toISOString(),
      updatedAt: run.updatedAt || new Date().toISOString(),
    };
    this.store.runs.unshift(fullRun);
    await this._flush();
    return JSON.parse(JSON.stringify(fullRun));
  }

  async updateRun(id, updates) {
    await this.init();
    const idx = this.store.runs.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this.store.runs[idx] = {
      ...this.store.runs[idx],
      ...JSON.parse(JSON.stringify(updates)),
      updatedAt: new Date().toISOString(),
    };
    await this._flush();
    return JSON.parse(JSON.stringify(this.store.runs[idx]));
  }

  async deleteRun(id, userId = null) {
    await this.init();
    const prevLen = this.store.runs.length;
    this.store.runs = this.store.runs.filter(r => !(r.id === id && (!userId || r.userId === userId)));
    if (this.store.runs.length === prevLen) {
      return false;
    }
    await this._flush();
    return true;
  }

  async cleanupStaleRuns() {
    await this.init();
    let cleaned = 0;
    for (const r of this.store.runs) {
      if (['queued', 'validating', 'running'].includes(r.status)) {
        r.status = 'failed';
        r.error = 'Aborted due to unexpected server restart';
        r.finishedAt = new Date().toISOString();
        r.updatedAt = new Date().toISOString();
        cleaned++;
      }
    }
    if (cleaned > 0) {
      await this._flush();
    }
    return cleaned;
  }

  async createAuditEvent({ userId, action, resourceType, resourceId, details = {}, ipAddress = null }) {
    await this.init();
    const event = {
      id: randomUUID(),
      userId: userId || null,
      action,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      details,
      ipAddress,
      createdAt: new Date().toISOString(),
    };
    this.store.auditEvents.push(event);
    await this._flush();
    return event;
  }

  getHealthInfo() {
    return {
      storage: 'local-json',
      path: this.dataFile,
      usersCount: this.store.users.length,
      targetsCount: this.store.targets.length,
      runsCount: this.store.runs.length,
    };
  }
}
