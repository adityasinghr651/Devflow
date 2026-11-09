import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getStorage } from '../storage/index.js';

const SALT_ROUNDS = 10;

export async function hashPassword(plainText) {
  const validation = validatePassword(plainText);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return await bcrypt.hash(plainText, SALT_ROUNDS);
}

const COMMON_PASSWORDS = new Set(['password123!', 'password123', 'qwerty12345', 'letmein123!', 'admin123456', 'welcome123!']);
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) return { valid: false, error: 'Password must be between 10 and 128 characters.' };
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return { valid: false, error: 'Password must include lowercase, uppercase, number, and symbol characters.' };
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return { valid: false, error: 'Choose a less common password.' };
  return { valid: true };
}

export async function verifyPassword(plainText, hash) {
  if (typeof plainText !== 'string' || !hash) {
    return false;
  }
  return await bcrypt.compare(plainText, hash);
}

export function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    tier: user.tier || (user.role === 'admin' ? 'admin' : 'free'),
    plan: user.plan || (user.role === 'admin' ? 'admin' : 'free'),
    ...(user.purpose ? { purpose: user.purpose } : {}),
    ...(user.expiresAt ? { expiresAt: user.expiresAt } : {}),
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

// Authentication middleware
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const cookieToken = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('devflow_demo='))?.slice('devflow_demo='.length);
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && cookieToken) {
    try {
      const decoded = verifyToken(cookieToken);
      if (decoded.purpose !== 'demo' || Date.parse(decoded.expiresAt) <= Date.now()) throw new Error('Invalid demo session');
      const current = await getStorage().getUserById(decoded.id);
      if (!current || current.tier !== 'demo' || Date.parse(current.demoExpiresAt) <= Date.now()) throw new Error('Demo session has expired');
      req.user = { ...decoded, id: current.id, email: current.email, name: current.name, role: current.role, tier: 'demo', plan: 'demo' };
      return next();
    } catch {
      return res.status(401).json({ error: 'Demo session expired. Start a new demo session or sign in.' });
    }
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing.' });
  }

  try {
    const decoded = verifyToken(token);
    getStorage().getUserById(decoded.id).then(current => {
      if (!current) return res.status(401).json({ error: 'Account is no longer available. Please log in again.' });
      req.user = { ...decoded, id: current.id, email: current.email, name: current.name, role: current.role, tier: current.tier || 'free', plan: current.plan || 'free' };
      return next();
    }).catch(next);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

// In-memory sliding-window rate limiter for sensitive auth endpoints
const rateLimitMap = new Map(); // IP and normalized account -> timestamps

export function authRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.authRateLimitWindowMs;
  const maxAttempts = config.authRateLimitMax;

  const account = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const keys = [`ip:${ip}`, ...(account ? [`account:${account}`] : [])];
  const windows = keys.map(key => [key, (rateLimitMap.get(key) || []).filter(ts => now - ts < windowMs)]);
  const blocked = windows.find(([, timestamps]) => timestamps.length >= maxAttempts);
  if (blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - blocked[1][0])) / 1000));
    res.setHeader?.('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: `Too many authentication attempts; try again in ${retryAfterSeconds}s.`, retryAfterSeconds,
    });
  }
  for (const [key, timestamps] of rateLimitMap) if (!timestamps.some(ts => now - ts < windowMs)) rateLimitMap.delete(key);
  for (const [key, timestamps] of windows) { timestamps.push(now); rateLimitMap.set(key, timestamps); }
  next();
}

