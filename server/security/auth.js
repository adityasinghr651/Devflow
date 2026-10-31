import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const SALT_ROUNDS = 10;

export async function hashPassword(plainText) {
  if (typeof plainText !== 'string' || plainText.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  return await bcrypt.hash(plainText, SALT_ROUNDS);
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
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

// Authentication middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing.' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

// In-memory sliding-window rate limiter for sensitive auth endpoints
const rateLimitMap = new Map(); // ip -> [timestamps]

export function authRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.authRateLimitWindowMs;
  const maxAttempts = config.authRateLimitMax;

  let timestamps = rateLimitMap.get(ip) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);

  if (timestamps.length >= maxAttempts) {
    return res.status(429).json({
      error: 'Too many authentication attempts. Please try again after 1 minute.',
    });
  }

  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  next();
}

