import express from 'express';
import { randomUUID } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticateToken,
  authRateLimiter,
} from '../security/auth.js';

export const authRouter = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
authRouter.post('/auth/register', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};

    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80) {
      return res.status(400).json({ error: 'Name must be between 1 and 80 characters.' });
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.length > 255) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    }

    const storage = getStorage();
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: 'user',
    });

    await storage.createAuditEvent({
      userId: user.id,
      action: 'USER_REGISTER',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/auth/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const storage = getStorage();
    const normalizedEmail = email.trim().toLowerCase();
    const user = await storage.getUserByEmail(normalizedEmail);

    if (!user) {
      await storage.createAuditEvent({
        action: 'USER_LOGIN_FAILED',
        details: { email: normalizedEmail, reason: 'user_not_found' },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await storage.createAuditEvent({
        userId: user.id,
        action: 'USER_LOGIN_FAILED',
        details: { email: normalizedEmail, reason: 'invalid_password' },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    await storage.createAuditEvent({
      userId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      details: { email: user.email },
      ipAddress: req.ip,
    });

    const token = generateToken(safeUser);
    res.json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/oauth (GitHub & Google Social Authentication & Account Provisioning)
authRouter.post('/auth/oauth', authRateLimiter, async (req, res, next) => {
  try {
    const { provider, email, name, providerId } = req.body || {};

    if (!['github', 'google'].includes(provider)) {
      return res.status(400).json({ error: 'Unsupported auth provider. Supported: github, google.' });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required from the OAuth provider.' });
    }

    const storage = getStorage();
    const normalizedEmail = email.trim().toLowerCase();
    let user = await storage.getUserByEmail(normalizedEmail);

    if (!user) {
      const defaultName = name && typeof name === 'string' && name.trim().length > 0
        ? name.trim()
        : (provider === 'github' ? 'GitHub Developer' : 'Google User');

      const passwordHash = await hashPassword(randomUUID() + '-oauth-' + provider);

      user = await storage.createUser({
        email: normalizedEmail,
        passwordHash,
        name: defaultName,
        role: 'user',
      });

      await storage.createAuditEvent({
        userId: user.id,
        action: 'USER_OAUTH_REGISTER',
        resourceType: 'user',
        resourceId: user.id,
        details: { provider, email: user.email, providerId: providerId || null },
        ipAddress: req.ip,
      });
    } else {
      await storage.createAuditEvent({
        userId: user.id,
        action: 'USER_OAUTH_LOGIN',
        resourceType: 'user',
        resourceId: user.id,
        details: { provider, email: user.email, providerId: providerId || null },
        ipAddress: req.ip,
      });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = generateToken(safeUser);
    res.json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/auth/me', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const user = await storage.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post('/auth/logout', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    await storage.createAuditEvent({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      details: { email: req.user.email },
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

