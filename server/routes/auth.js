import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import { recordAuditEvent } from '../audit.js';
import { config } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticateToken,
  authRateLimiter,
  validatePassword,
} from '../security/auth.js';

export const authRouter = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oauthStates = new Map();
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const OAUTH_COOKIE = 'devflow_oauth_session';
function cookieValue(req, name) { return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''; }
function cookieFlags() { return `HttpOnly; SameSite=Lax; Path=/api; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }

// POST /api/auth/register
authRouter.post('/auth/register', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};

    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80) {
      return res.status(400).json({ error: 'Name must be between 1 and 80 characters.', field: 'name' });
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.length > 255) {
      return res.status(400).json({ error: 'A valid email address is required.', field: 'email' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) return res.status(400).json({ error: passwordValidation.error, field: 'password' });

    const storage = getStorage();
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
    }

    const passwordHash = await hashPassword(password);
    let user;
    try { user = await storage.createUser({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: 'user',
      tier: 'free', plan: 'free',
    }); } catch (error) { if (/email already registered/i.test(error.message) || error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' }); throw error; }

    await recordAuditEvent(storage, {
      userId: user.id,
      action: 'USER_REGISTER',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    const safeUser = { ...user, tier: user.tier || 'free', plan: user.plan || 'free' };
    const token = generateToken(safeUser);
    res.status(201).json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-events — authenticated users can read only their own events.
authRouter.get('/audit-events', authenticateToken, async (req, res, next) => {
  try {
    const storage = getStorage();
    const events = await storage.getAuditEvents(req.user.id, req.query.limit);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/auth/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.length > 255) return res.status(400).json({ error: 'A valid email address is required.', field: 'email' });
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) return res.status(400).json({ error: 'Password must be between 1 and 128 characters.', field: 'password' });

    const storage = getStorage();
    const normalizedEmail = email.trim().toLowerCase();
    const user = await storage.getUserByEmail(normalizedEmail);

    if (!user) {
      await recordAuditEvent(storage, {
        action: 'USER_LOGIN_FAILED',
        details: { email: normalizedEmail, reason: 'user_not_found' },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Invalid email or password.', field: 'credentials' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await recordAuditEvent(storage, {
        userId: user.id,
        action: 'USER_LOGIN_FAILED',
        details: { email: normalizedEmail, reason: 'invalid_password' },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Invalid email or password.', field: 'credentials' });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tier: user.tier || (user.role === 'admin' ? 'admin' : 'free'),
      plan: user.plan || (user.role === 'admin' ? 'admin' : 'free'),
    };

    await recordAuditEvent(storage, {
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

// This legacy endpoint deliberately never authenticates. Identity claims from a browser are not proof.
authRouter.post('/auth/oauth', (_req, res) => res.status(400).json({ error: 'OAuth requires the authorization-code flow. Start at /auth/oauth/:provider/start.' }));

authRouter.get('/auth/oauth/:provider/start', authRateLimiter, (req, res) => {
  const { provider } = req.params;
  if (!['github', 'google'].includes(provider)) return res.status(400).json({ error: 'Unsupported auth provider.' });
  const clientId = provider === 'github' ? process.env.GITHUB_CLIENT_ID : process.env.GOOGLE_CLIENT_ID;
  const clientSecret = provider === 'github' ? process.env.GITHUB_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).json({ error: `${provider} OAuth is not configured on this server.` });
  for (const [key, value] of oauthStates) if (value.expiresAt <= Date.now()) oauthStates.delete(key);
  const session = randomUUID(); const state = randomUUID();
  oauthStates.set(session, { state, provider, expiresAt: Date.now() + 10 * 60 * 1000 });
  res.setHeader('Set-Cookie', `${OAUTH_COOKIE}=${session}; ${cookieFlags()}`);
  const redirectUri = `${process.env.OAUTH_REDIRECT_BASE_URL || 'http://localhost:4000/api/auth/oauth'}/${provider}/callback`;
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state });
  if (provider === 'github') { query.set('scope', 'read:user user:email'); return res.redirect(302, `https://github.com/login/oauth/authorize?${query}`); }
  query.set('response_type', 'code'); query.set('scope', 'openid email profile'); query.set('prompt', 'select_account');
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${query}`);
});

async function exchangeOAuthCode(provider, code, redirectUri) {
  if (provider === 'github') {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw Object.assign(new Error('GitHub authorization code was rejected.'), { statusCode: 401 });
    const headers = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'DevFlow' };
    const [profileResponse, emailsResponse] = await Promise.all([fetch('https://api.github.com/user', { headers }), fetch('https://api.github.com/user/emails', { headers })]);
    if (!profileResponse.ok || !emailsResponse.ok) throw Object.assign(new Error('Could not verify the GitHub profile.'), { statusCode: 401 });
    const [profile, emails] = await Promise.all([profileResponse.json(), emailsResponse.json()]);
    const verified = Array.isArray(emails) ? emails.find(item => item.primary && item.verified) : null;
    if (!profile.id || !verified?.email) throw Object.assign(new Error('GitHub did not return a verified email address.'), { statusCode: 401 });
    return { providerId: String(profile.id), email: verified.email, name: profile.name || profile.login || 'GitHub user' };
  }
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) throw Object.assign(new Error('Google authorization code was rejected.'), { statusCode: 401 });
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || profile.email_verified !== true || !profile.sub || !profile.email) throw Object.assign(new Error('Google did not return a verified email address.'), { statusCode: 401 });
  return { providerId: profile.sub, email: profile.email, name: profile.name || 'Google user' };
}

async function completeOAuth(provider, code, state, req) {
  const session = cookieValue(req, OAUTH_COOKIE); const stored = oauthStates.get(session);
  oauthStates.delete(session);
  if (!stored || stored.expiresAt <= Date.now() || stored.provider !== provider || !state || stored.state !== state) throw Object.assign(new Error('OAuth state is invalid or expired. Restart sign in.'), { statusCode: 400 });
  if (typeof code !== 'string' || code.length < 1 || code.length > 2048) throw Object.assign(new Error('A valid authorization code is required.'), { statusCode: 400 });
  const redirectUri = `${process.env.OAUTH_REDIRECT_BASE_URL || 'http://localhost:4000/api/auth/oauth'}/${provider}/callback`;
  const identity = await exchangeOAuthCode(provider, code, redirectUri);
  const storage = getStorage();
  let user = await storage.getUserByOAuth(provider, identity.providerId);
  if (!user) {
    const existing = await storage.getUserByEmail(identity.email.toLowerCase());
    if (existing) throw Object.assign(new Error('An account already uses this email. Sign in with that method first; account linking requires explicit confirmation.'), { statusCode: 409 });
    user = await storage.createUser({ email: identity.email.toLowerCase(), name: identity.name, role: 'user', tier: 'free', plan: 'free', oauthProvider: provider, oauthProviderId: identity.providerId, passwordHash: await hashPassword(`${randomUUID()}!Aa9`) });
  }
  await recordAuditEvent(storage, { userId: user.id, action: 'USER_OAUTH_LOGIN', resourceType: 'user', resourceId: user.id, details: { provider }, ipAddress: req.ip });
  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, tier: user.tier || 'free', plan: user.plan || 'free' };
  return generateToken(safeUser);
}

authRouter.get('/auth/oauth/:provider/callback', authRateLimiter, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!['github', 'google'].includes(provider)) return res.status(400).json({ error: 'Unsupported auth provider.' });
    if (req.query.error) return res.status(400).json({ error: 'OAuth sign in was denied.' });
    const token = await completeOAuth(provider, req.query.code, req.query.state, req);
    const destination = process.env.OAUTH_FRONTEND_SUCCESS_URL || 'http://localhost:3000/';
    res.clearCookie(OAUTH_COOKIE, { path: '/api' });
    res.redirect(303, `${destination.replace(/#.*$/, '')}#oauth_token=${encodeURIComponent(token)}`);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ error: error.message }); next(error); }
});

authRouter.post('/auth/oauth/:provider/callback', authRateLimiter, async (req, res, next) => {
  try {
    if (!['github', 'google'].includes(req.params.provider)) return res.status(400).json({ error: 'Unsupported auth provider.' });
    const token = await completeOAuth(req.params.provider, req.body?.code, req.body?.state, req);
    const decoded = verifyOAuthToken(token);
    const user = await getStorage().getUserById(decoded.id);
    res.clearCookie(OAUTH_COOKIE, { path: '/api' });
    res.json({ token, user });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ error: error.message }); next(error); }
});

function verifyOAuthToken(token) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }

authRouter.post('/auth/demo', authRateLimiter, async (req, res, next) => {
  try {
    const storage = getStorage();
    const now = new Date();
    await storage.cleanupExpiredDemoUsers?.(now.toISOString());
    const id = randomUUID(); const expiresAt = new Date(now.getTime() + DEMO_TTL_MS).toISOString();
    const user = await storage.createUser({ email: `demo-${id}@sessions.invalid`, name: 'Demo User', passwordHash: await hashPassword(`${randomUUID()}!Aa9`), role: 'user', tier: 'demo', plan: 'demo', demoExpiresAt: expiresAt });
    const token = generateToken({ ...user, role: 'user', tier: 'demo', purpose: 'demo', expiresAt });
    res.setHeader('Set-Cookie', `devflow_demo=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=86400${config.isProduction ? '; Secure' : ''}`);
    res.status(201).json({ user: { ...user, tier: 'demo', plan: 'demo' }, expiresAt, quota: 10, restriction: { maxConcurrency: 2, maxDurationSec: Math.min(10, config.maxDurationSec) } });
  } catch (err) { next(err); }
});
authRouter.post('/auth/demo/logout', (_req, res) => { res.clearCookie('devflow_demo', { path: '/api' }); res.json({ ok: true }); });

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
    await recordAuditEvent(storage, {
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

