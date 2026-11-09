import express from 'express';
import { hashPassword, authenticateToken, validatePassword } from '../security/auth.js';
import { getStorage } from '../storage/index.js';
import { recordAuditEvent } from '../audit.js';

export const adminRouter = express.Router();
async function requireAdmin(req, res, next) {
  try {
    const current = await getStorage().getUserById(req.user.id);
    if (!current || current.role !== 'admin' || current.tier !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
    req.adminUser = current; next();
  } catch (error) { next(error); }
}
adminRouter.use('/admin', authenticateToken, requireAdmin);

adminRouter.get('/admin/stats', async (_req, res, next) => { try { res.json(await getStorage().getPlatformStats()); } catch (error) { next(error); } });
adminRouter.get('/admin/users', async (req, res, next) => { try { const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)); const offset = Math.max(0, Number(req.query.offset) || 0); const users = await getStorage().listUsers(); res.json({ items: users.slice(offset, offset + limit), total: users.length, limit, offset }); } catch (error) { next(error); } });
adminRouter.patch('/admin/users/:id/tier', async (req, res, next) => {
  try {
    const { tier } = req.body || {};
    if (!['free', 'paid', 'admin'].includes(tier)) return res.status(400).json({ error: 'Tier must be free, paid, or admin.', field: 'tier' });
    if (req.params.id === req.adminUser.id && tier !== 'admin') return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
    const current = await getStorage().getUserById(req.params.id); if (!current || current.tier === 'demo') return res.status(404).json({ error: 'User not found.' });
    const updated = await getStorage().updateUser(req.params.id, { tier, plan: tier === 'paid' ? 'pro' : tier, role: tier === 'admin' ? 'admin' : 'user' });
    await recordAuditEvent(getStorage(), { userId: req.adminUser.id, action: 'ADMIN_TIER_CHANGE', resourceType: 'user', resourceId: updated.id, details: { tier } });
    res.json({ user: updated });
  } catch (error) { next(error); }
});
adminRouter.post('/admin/users', async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required.', field: 'email' });
    const validation = validatePassword(password); if (!validation.valid) return res.status(400).json({ error: validation.error, field: 'password' });
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required.', field: 'name' });
    if (await getStorage().getUserByEmail(email.trim().toLowerCase())) return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
    const user = await getStorage().createUser({ email: email.trim().toLowerCase(), passwordHash: await hashPassword(password), name: name.trim().slice(0, 100), role: 'admin', tier: 'admin', plan: 'admin' });
    await recordAuditEvent(getStorage(), { userId: req.adminUser.id, action: 'ADMIN_CREATE', resourceType: 'user', resourceId: user.id });
    res.status(201).json({ user });
  } catch (error) { if (error.code === '23505' || /email already registered/i.test(error.message)) return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' }); next(error); }
});
adminRouter.delete('/admin/runs/:id', async (req, res, next) => {
  try { const run = await getStorage().getRunById(req.params.id); if (!run) return res.status(404).json({ error: 'Run not found.' }); if (['queued','running','validating','cancelling'].includes(run.status)) return res.status(409).json({ error: 'Active runs cannot be deleted.' }); const deleted = await getStorage().deleteRun(run.id); if (!deleted) return res.status(404).json({ error: 'Run not found.' }); await recordAuditEvent(getStorage(), { userId: req.adminUser.id, action: 'ADMIN_RUN_DELETE', resourceType: 'run', resourceId: run.id }); res.json({ deleted: true }); } catch (error) { next(error); }
});
