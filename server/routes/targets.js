import express from 'express';
import { randomUUID } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import { validateTargetPayload } from '../security/validation.js';
import { authenticateToken } from '../security/auth.js';
import { isLocalhostTarget, verifyTargetOwnership } from '../security/ownership.js';
import { config } from '../config.js';

export const targetsRouter = express.Router();

// GET /api/targets (Scoped to authenticated user)
targetsRouter.get('/targets', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const targets = await storage.getTargets(req.user.id);
    res.json(targets);
  } catch (err) {
    next(err);
  }
});

// POST /api/targets (Scoped to authenticated user)
targetsRouter.post('/targets', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const validation = await validateTargetPayload(req.body, {
      allowLocalTargets: config.allowLocalTargets,
    });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { name, url, environment } = validation.data;
    const isLocal = isLocalhostTarget(url);
    const verificationToken = 'st_tok_' + randomUUID().replace(/-/g, '');

    const target = {
      id: randomUUID(),
      userId: req.user.id,
      name,
      url,
      environment,
      verified: isLocal && config.allowLocalTargets,
      verificationToken,
      verificationMethod: isLocal && config.allowLocalTargets ? 'local_development' : null,
      verifiedAt: isLocal && config.allowLocalTargets ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    };

    const saved = await storage.createTarget(target);

    await storage.createAuditEvent({
      userId: req.user.id,
      action: 'TARGET_CREATE',
      resourceType: 'target',
      resourceId: saved.id,
      details: { name: saved.name, url: saved.url, verified: saved.verified },
      ipAddress: req.ip,
    });

    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// POST /api/targets/:id/verify (Verify ownership for non-local target)
targetsRouter.post('/targets/:id/verify', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const target = await storage.getTargetById(req.params.id, req.user.id);
    if (!target) {
      return res.status(404).json({ error: 'Target not found.' });
    }

    if (target.verified) {
      return res.json({ verified: true, message: 'Target is already verified.', target });
    }

    const result = await verifyTargetOwnership(target, {
      allowLocalTargets: config.allowLocalTargets,
    });

    if (result.verified) {
      const updated = await storage.updateTarget(
        target.id,
        {
          verified: true,
          verificationMethod: result.method,
          verifiedAt: result.verifiedAt,
        },
        req.user.id
      );

      await storage.createAuditEvent({
        userId: req.user.id,
        action: 'TARGET_VERIFIED',
        resourceType: 'target',
        resourceId: target.id,
        details: { method: result.method },
        ipAddress: req.ip,
      });

      return res.json({ verified: true, target: updated });
    } else {
      return res.status(400).json({
        verified: false,
        error: result.error,
        verificationToken: target.verificationToken,
      });
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /api/targets/:id (Scoped to authenticated user)
targetsRouter.delete('/targets/:id', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const targetId = req.params.id;

    // Check ownership
    const existing = await storage.getTargetById(targetId, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Target not found.' });
    }

    // Check if active test runs exist for this target
    const runs = await storage.getRuns(req.user.id);
    const hasActiveRun = runs.some(
      r => r.targetId === targetId && ['queued', 'validating', 'running'].includes(r.status)
    );

    if (hasActiveRun) {
      return res.status(409).json({ error: 'Cannot delete a target with an active test run.' });
    }

    const deleted = await storage.deleteTarget(targetId, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Target not found.' });
    }

    await storage.createAuditEvent({
      userId: req.user.id,
      action: 'TARGET_DELETE',
      resourceType: 'target',
      resourceId: targetId,
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
