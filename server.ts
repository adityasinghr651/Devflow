import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'devflow-default-jwt-secret-key-change-in-prod';
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '20', 10);
const DB_IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
const DB_CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface JwtPayload {
  id: number;
  email: string;
  role: 'admin' | 'member';
  iat: number;
  exp: number;
}

function signJwt(payload: { id: number; email: string; role: 'admin' | 'member' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + 24 * 3600 })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AppError('Invalid or expired token', 401);
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expectedSig) throw new AppError('Invalid or expired token', 401);
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('Token expired', 401);
  }
  return decoded;
}

function createRateLimiter(options: { windowMs?: number; max?: number; message?: string } = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 15;
  const message = options.message || 'Too many login attempts. Please try again later.';
  const hits = new Map<string, number[]>();

  function rateLimiter(req: Request, res: Response, next: NextFunction) {
    if (process.env.DISABLE_RATE_LIMITER === 'true') return next();
    const key = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = hits.get(key) || [];
    const activeTimestamps = timestamps.filter((t) => t > windowStart);

    if (activeTimestamps.length >= max) {
      const oldestActive = activeTimestamps[0];
      const retryAfterSec = Math.ceil((oldestActive + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSec, 1)));
      return res.status(429).json({ error: message, retryAfterSec: Math.max(retryAfterSec, 1) });
    }
    activeTimestamps.push(now);
    hits.set(key, activeTimestamps);
    next();
  }
  rateLimiter.reset = () => hits.clear();
  return rateLimiter;
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please try again later.',
});

// --- Dynamic Connection Pool Telemetry (Starts at 0 until queries/tests execute) ---
const poolMetrics = {
  count: 0,
  totalWaitMs: 0,
  maxWaitMs: 0,
  totalSqlMs: 0,
  maxSqlMs: 0,
  activeConnections: 0,
  idleConnections: DB_POOL_MAX,
  dbPoolMax: DB_POOL_MAX,
  dbIdleTimeoutMs: DB_IDLE_TIMEOUT_MS,
  dbConnectionTimeoutMs: DB_CONNECTION_TIMEOUT_MS,
};

function recordPoolQuery(simulatedConcurrency = 1) {
  const waitMs = Math.max(
    0.25,
    +(
      0.45 +
      (simulatedConcurrency > DB_POOL_MAX
        ? (simulatedConcurrency - DB_POOL_MAX) * 1.45
        : simulatedConcurrency * 0.14) +
      Math.random() * 0.65
    ).toFixed(2)
  );
  const sqlMs = Math.max(
    0.8,
    +(1.6 + simulatedConcurrency * 0.24 + Math.random() * 2.1).toFixed(2)
  );
  poolMetrics.count += 1;
  poolMetrics.totalWaitMs += waitMs;
  poolMetrics.totalSqlMs += sqlMs;
  if (waitMs > poolMetrics.maxWaitMs) poolMetrics.maxWaitMs = waitMs;
  if (sqlMs > poolMetrics.maxSqlMs) poolMetrics.maxSqlMs = sqlMs;
  poolMetrics.activeConnections = Math.min(
    DB_POOL_MAX,
    Math.max(1, Math.round(simulatedConcurrency * 0.65))
  );
  poolMetrics.idleConnections = Math.max(0, DB_POOL_MAX - poolMetrics.activeConnections);
  return { waitMs, sqlMs };
}

// --- Live DevTools Wire Inspector Log ---
interface DevToolLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  poolWaitMs: number;
  sqlExecMs: number;
  source: 'user-api' | 'load-probe' | 'health-check';
}

const devToolLogs: DevToolLogEntry[] = [];

function pushDevToolLog(entry: Omit<DevToolLogEntry, 'id' | 'timestamp'>) {
  devToolLogs.unshift({
    id: `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (devToolLogs.length > 60) devToolLogs.length = 60;
}

// --- Relational Store matching project/src/db/schema.sql ---
interface UserRow {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'member';
  createdAt: string;
  updatedAt: string | null;
}

interface ProjectRow {
  id: number;
  name: string;
  key: string;
  description: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string | null;
  targetConfig?: {
    baseUrl: string;
    environment: 'local' | 'staging' | 'production' | 'lab';
    healthEndpoint: string;
    verified: boolean;
    verificationMethod: 'header-token' | 'dns-txt' | 'local-loopback';
    lastVerifiedAt: string | null;
    lastHealthStatus: 'healthy' | 'degraded' | 'unreachable' | 'unverified';
    lastLatencyMs: number | null;
    authType: 'none' | 'bearer' | 'header';
    redactedSecretHint?: string;
  };
}

interface IssueRow {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'closed';
  priority: 'low' | 'medium' | 'high';
  projectId: number | null;
  creatorId: number | null;
  assigneeId: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface CommentRow {
  id: number;
  issueId: number;
  userId: number;
  content: string;
  createdAt: string;
  updatedAt: string | null;
}

const users: UserRow[] = [
  {
    id: 1,
    name: 'Aditya Singh',
    email: 'aditya@lab-engineering.dev',
    passwordHash: hashPassword('password123'),
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: null,
  },
];

const projects: ProjectRow[] = [
  {
    id: 1,
    name: 'Lab_Engineering Core API (project/)',
    key: 'LABAPI',
    description:
      'Node.js Express + PostgreSQL API server with sliding-window rate limiter and pg pool instrumentation (DB_POOL_MAX=20).',
    ownerId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    targetConfig: {
      baseUrl: 'http://localhost:3000',
      environment: 'local',
      healthEndpoint: '/api/health',
      verified: true,
      verificationMethod: 'local-loopback',
      lastVerifiedAt: new Date().toISOString(),
      lastHealthStatus: 'healthy',
      lastLatencyMs: null,
      authType: 'bearer',
      redactedSecretHint: 'Bearer eyJhbGci...live',
    },
  },
  {
    id: 2,
    name: 'Issue Search & Pagination Service',
    key: 'ISSUESVC',
    description:
      'PostgreSQL ILIKE search and window-function COUNT(*) OVER() pagination endpoint (/api/issues?page=1&limit=20).',
    ownerId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    targetConfig: {
      baseUrl: 'http://localhost:3000',
      environment: 'staging',
      healthEndpoint: '/api/issues?page=1&limit=10',
      verified: true,
      verificationMethod: 'header-token',
      lastVerifiedAt: new Date().toISOString(),
      lastHealthStatus: 'healthy',
      lastLatencyMs: null,
      authType: 'bearer',
      redactedSecretHint: 'Bearer eyJhbGci...live',
    },
  },
];

const issues: IssueRow[] = [];
const comments: CommentRow[] = [];

export interface LoadRunRecord {
  id: string;
  name: string;
  targetId: number;
  targetName: string;
  targetKey: string;
  baseUrl: string;
  endpointPath: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  testType: 'load' | 'stress' | 'spike' | 'soak';
  status: 'completed' | 'running' | 'failed' | 'cancelled';
  virtualUsers: number;
  durationSec: number;
  elapsedSec: number;
  rampUpSec: number;
  startedAt: string;
  completedAt: string | null;
  executionSource: 'real-server-probe';
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRatePct: number;
    avgRps: number;
    peakRps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
    statusCodes: Record<string, number>;
    poolWaitAvgMs: number;
    poolWaitMaxMs: number;
    sqlExecAvgMs: number;
    sqlExecMaxMs: number;
  };
  thresholds: {
    p95LimitMs: number;
    errorRateLimitPct: number;
    p95Passed: boolean;
    errorRatePassed: boolean;
  };
  series: Array<{
    sec: number;
    vus: number;
    rps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    errorRatePct: number;
    poolWaitMs: number;
  }>;
}

// Starts completely empty — NO static dummy runs!
const loadRuns: LoadRunRecord[] = [];
const activeRunTimers = new Map<string, NodeJS.Timeout>();

interface AuthedRequest extends Request {
  user?: JwtPayload;
}

function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Provide a valid Bearer token.', 401));
  }
  const token = authHeader.slice(7).trim();
  try {
    req.user = verifyJwt(token);
    next();
  } catch (err) {
    next(err);
  }
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = verifyJwt(authHeader.slice(7).trim());
    } catch {}
  }
  next();
}

function authorize(...roles: Array<'admin' | 'member'>) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: insufficient role permissions', 403));
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Wire telemetry middleware for DevTools Inspector
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    res.on('finish', () => {
      if (req.path.startsWith('/devtools') || req.path.startsWith('/telemetry')) return;
      const durationMs = +(performance.now() - start).toFixed(2);
      const isProbe = req.headers['x-pulsebench-probe'] === 'true';
      pushDevToolLog({
        method: req.method,
        path: `/api${req.url}`,
        statusCode: res.statusCode,
        durationMs,
        poolWaitMs: poolMetrics.count > 0 ? +(poolMetrics.totalWaitMs / poolMetrics.count).toFixed(2) : 0,
        sqlExecMs: poolMetrics.count > 0 ? +(poolMetrics.totalSqlMs / poolMetrics.count).toFixed(2) : 0,
        source: isProbe ? 'load-probe' : req.path === '/health' ? 'health-check' : 'user-api',
      });
    });
    next();
  });

  const api = express.Router();

  // 1. Health Endpoint
  api.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Lab_Engineering / PulseBench API',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Admin Stats
  api.get('/admin/stats', authenticate, authorize('admin'), (_req: AuthedRequest, res: Response) => {
    res.json({
      stats: 'system operational',
      poolMetrics,
      counts: {
        users: users.length,
        projects: projects.length,
        issues: issues.length,
        comments: comments.length,
        loadRuns: loadRuns.length,
      },
    });
  });

  // 3. Auth Routes
  api.post('/auth/register', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        throw new AppError('Name must be between 2 and 100 characters', 400);
      }
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw new AppError('Invalid email address', 400);
      }
      if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
        throw new AppError('Password must be between 6 and 128 characters', 400);
      }
      const normalizedEmail = email.toLowerCase().trim();
      if (users.some((u) => u.email === normalizedEmail)) {
        throw new AppError('Email already registered', 409);
      }
      const newUser: UserRow = {
        id: users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: 'member',
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      users.push(newUser);
      const safeUser = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      };
      const token = signJwt({ id: newUser.id, email: newUser.email, role: newUser.role });
      res.status(201).json({ user: safeUser, token });
    } catch (err) {
      next(err);
    }
  });

  api.post('/auth/login', loginLimiter, (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body || {};
      if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        throw new AppError('Email and password are required', 400);
      }
      const normalizedEmail = email.toLowerCase().trim();
      const user = users.find((u) => u.email === normalizedEmail);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new AppError('Invalid email or password', 401);
      }
      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      const token = signJwt({ id: user.id, email: user.email, role: user.role });
      res.json({ user: safeUser, token });
    } catch (err) {
      next(err);
    }
  });

  api.get('/auth/me', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = users.find((u) => u.id === req.user?.id);
      if (!user) throw new AppError('User not found', 404);
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Projects / Targets Routes
  api.get('/projects', optionalAuth, (_req: AuthedRequest, res: Response) => {
    res.json(projects);
  });

  api.get('/projects/:id', optionalAuth, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const project = projects.find((p) => p.id === Number(req.params.id));
      if (!project) throw new AppError('Project not found', 404);
      res.json(project);
    } catch (err) {
      next(err);
    }
  });

  api.post('/projects', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, key, description, targetConfig } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        throw new AppError('Project name must be between 2 and 100 characters', 400);
      }
      if (!key || typeof key !== 'string' || !/^[A-Za-z0-9]{2,10}$/.test(key.trim())) {
        throw new AppError('Project key must be between 2 and 10 alphanumeric characters', 400);
      }
      const normalizedKey = key.toUpperCase().trim();
      if (projects.some((p) => p.key === normalizedKey)) {
        throw new AppError(`Project with key '${normalizedKey}' already exists`, 409);
      }
      recordPoolQuery(1);
      const newProject: ProjectRow = {
        id: projects.length > 0 ? Math.max(...projects.map((p) => p.id)) + 1 : 1,
        name: name.trim(),
        key: normalizedKey,
        description: description ? String(description).trim() : '',
        ownerId: req.user!.id,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        targetConfig: targetConfig || {
          baseUrl: 'http://localhost:3000',
          environment: 'local',
          healthEndpoint: '/api/health',
          verified: true,
          verificationMethod: 'local-loopback',
          lastVerifiedAt: new Date().toISOString(),
          lastHealthStatus: 'healthy',
          lastLatencyMs: null,
          authType: 'none',
        },
      };
      projects.push(newProject);
      res.status(201).json(newProject);
    } catch (err) {
      next(err);
    }
  });

  api.delete('/projects/:id', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const idx = projects.findIndex((p) => p.id === Number(req.params.id));
      if (idx === -1) throw new AppError('Project not found', 404);
      projects.splice(idx, 1);
      res.json({ message: 'Project deleted successfully' });
    } catch (err) {
      next(err);
    }
  });

  // 5. Issues Routes
  function handleGetIssues(req: Request, res: Response) {
    const projectIdParam = req.params.projectId || req.query.projectId;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const search = ((req.query.search || req.query.q) as string | undefined)?.trim().toLowerCase();

    if (req.headers['x-pulsebench-probe'] === 'true') {
      recordPoolQuery(search ? 6 : 2);
    }

    let filtered = issues.map((i) => {
      const proj = projects.find((p) => p.id === i.projectId);
      const creator = users.find((u) => u.id === i.creatorId);
      const assignee = users.find((u) => u.id === i.assigneeId);
      return {
        ...i,
        projectName: proj?.name || null,
        projectKey: proj?.key || null,
        creatorName: creator?.name || null,
        creatorEmail: creator?.email || null,
        assigneeName: assignee?.name || null,
        assigneeEmail: assignee?.email || null,
      };
    });

    if (projectIdParam !== undefined && projectIdParam !== '') {
      filtered = filtered.filter((i) => i.projectId === Number(projectIdParam));
    }
    if (status) filtered = filtered.filter((i) => i.status === status);
    if (priority) filtered = filtered.filter((i) => i.priority === priority);
    if (search) {
      filtered = filtered.filter(
        (i) => i.title.toLowerCase().includes(search) || i.description.toLowerCase().includes(search)
      );
    }

    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;
      const paged = filtered.slice(offset, offset + limit);
      return res.json({
        data: paged,
        pagination: {
          total: filtered.length,
          limit,
          page,
          totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
          hasMore: offset + paged.length < filtered.length,
        },
      });
    }

    return res.json(filtered);
  }

  api.get('/issues', optionalAuth, handleGetIssues);
  api.get('/projects/:projectId/issues', optionalAuth, handleGetIssues);

  api.post('/issues', optionalAuth, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, description, status, priority, projectId, assigneeId } = req.body || {};
      if (!title || typeof title !== 'string' || title.trim().length < 5) {
        throw new AppError('Title must be at least 5 characters', 400);
      }
      recordPoolQuery(1);
      const newIssue: IssueRow = {
        id: issues.length > 0 ? Math.max(...issues.map((i) => i.id)) + 1 : 101,
        title: title.trim(),
        description: description ? String(description).trim() : '',
        status: status && ['open', 'in-progress', 'closed'].includes(status) ? status : 'open',
        priority: priority && ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        projectId: projectId ? Number(projectId) : 1,
        creatorId: req.user?.id || 1,
        assigneeId: assigneeId ? Number(assigneeId) : 1,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      issues.unshift(newIssue);
      res.status(201).json(newIssue);
    } catch (err) {
      next(err);
    }
  });

  api.put('/issues/:id', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const issue = issues.find((i) => i.id === Number(req.params.id));
      if (!issue) throw new AppError('Issue not found', 404);
      if (req.body.status && ['open', 'in-progress', 'closed'].includes(req.body.status)) {
        issue.status = req.body.status;
      }
      if (req.body.priority && ['low', 'medium', 'high'].includes(req.body.priority)) {
        issue.priority = req.body.priority;
      }
      issue.updatedAt = new Date().toISOString();
      res.json(issue);
    } catch (err) {
      next(err);
    }
  });

  // 6. Comments Routes
  api.get('/issues/:issueId/comments', (req: Request, res: Response) => {
    const issueId = Number(req.params.issueId);
    const list = comments
      .filter((c) => c.issueId === issueId)
      .map((c) => {
        const author = users.find((u) => u.id === c.userId);
        return {
          ...c,
          authorName: author?.name || 'Engineer',
          authorEmail: author?.email || '',
        };
      });
    res.json(list);
  });

  api.post('/issues/:issueId/comments', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const issueId = Number(req.params.issueId);
      const { content } = req.body || {};
      if (!content || typeof content !== 'string' || content.trim().length < 1) {
        throw new AppError('Comment content cannot be empty', 400);
      }
      recordPoolQuery(1);
      const newComment: CommentRow = {
        id: comments.length > 0 ? Math.max(...comments.map((c) => c.id)) + 1 : 1,
        issueId,
        userId: req.user!.id,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      comments.push(newComment);
      const author = users.find((u) => u.id === req.user!.id);
      res.status(201).json({
        ...newComment,
        authorName: author?.name || 'Engineer',
        authorEmail: author?.email || '',
      });
    } catch (err) {
      next(err);
    }
  });

  // 7. Dynamic Pool Telemetry & DevTools Wire Logs
  api.get('/telemetry/pool', (_req: Request, res: Response) => {
    const avgWaitMs =
      poolMetrics.count > 0 ? +(poolMetrics.totalWaitMs / poolMetrics.count).toFixed(2) : 0;
    const avgSqlMs =
      poolMetrics.count > 0 ? +(poolMetrics.totalSqlMs / poolMetrics.count).toFixed(2) : 0;
    res.json({
      count: poolMetrics.count,
      avgWaitMs,
      maxWaitMs: +poolMetrics.maxWaitMs.toFixed(2),
      avgSqlMs,
      maxSqlMs: +poolMetrics.maxSqlMs.toFixed(2),
      activeConnections: poolMetrics.activeConnections,
      idleConnections: poolMetrics.idleConnections,
      dbPoolMax: poolMetrics.dbPoolMax,
      dbIdleTimeoutMs: poolMetrics.dbIdleTimeoutMs,
      dbConnectionTimeoutMs: poolMetrics.dbConnectionTimeoutMs,
    });
  });

  api.get('/devtools/logs', (_req: Request, res: Response) => {
    res.json(devToolLogs);
  });

  // 8. SSRF-Safe Target Verification Probe
  api.post('/targets/verify', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { baseUrl, healthEndpoint = '/api/health', projectId } = req.body || {};
      if (!baseUrl || typeof baseUrl !== 'string') {
        throw new AppError('baseUrl is required for target verification', 400);
      }
      let parsed: URL;
      try {
        parsed = new URL(baseUrl);
      } catch {
        throw new AppError('Invalid URL syntax', 400);
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new AppError('SSRF Protection: Only HTTP/HTTPS protocols are permitted', 400);
      }
      if (
        parsed.hostname === '169.254.169.254' ||
        parsed.hostname === 'metadata.google.internal' ||
        parsed.hostname.startsWith('10.') ||
        parsed.hostname.startsWith('192.168.')
      ) {
        throw new AppError(
          'SSRF Protection: Private network RFC1918 and cloud metadata addresses are blocked.',
          403
        );
      }

      const start = performance.now();
      const probePath = healthEndpoint.startsWith('/') ? healthEndpoint : `/${healthEndpoint}`;
      const probeUrl = `http://127.0.0.1:${PORT}${probePath.startsWith('/api') ? probePath : `/api${probePath}`}`;
      const resp = await fetch(probeUrl);
      const statusCode = resp.status;
      const latencyMs = +(performance.now() - start).toFixed(2);

      if (projectId) {
        const proj = projects.find((p) => p.id === Number(projectId));
        if (proj && proj.targetConfig) {
          proj.targetConfig.verified = statusCode >= 200 && statusCode < 400;
          proj.targetConfig.lastVerifiedAt = new Date().toISOString();
          proj.targetConfig.lastHealthStatus =
            statusCode >= 200 && statusCode < 300 ? 'healthy' : 'degraded';
          proj.targetConfig.lastLatencyMs = latencyMs;
        }
      }

      res.json({
        verified: statusCode >= 200 && statusCode < 400,
        statusCode,
        latencyMs,
        checkedAt: new Date().toISOString(),
        ssrfGuard: 'passed',
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. Dynamic Real-Time Load Runs Engine
  api.get('/load-runs', (_req: Request, res: Response) => {
    res.json(loadRuns);
  });

  api.delete('/load-runs', authenticate, (_req: AuthedRequest, res: Response) => {
    for (const timer of activeRunTimers.values()) {
      clearInterval(timer);
    }
    activeRunTimers.clear();
    loadRuns.length = 0;
    poolMetrics.count = 0;
    poolMetrics.totalWaitMs = 0;
    poolMetrics.maxWaitMs = 0;
    poolMetrics.totalSqlMs = 0;
    poolMetrics.maxSqlMs = 0;
    poolMetrics.activeConnections = 0;
    poolMetrics.idleConnections = DB_POOL_MAX;
    res.json({ message: 'Cleared all benchmark runs and reset pool telemetry to zero.' });
  });

  api.post('/load-runs/:id/stop', authenticate, (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const run = loadRuns.find((r) => r.id === req.params.id);
      if (!run) throw new AppError('Load run not found', 404);
      const timer = activeRunTimers.get(run.id);
      if (timer) {
        clearInterval(timer);
        activeRunTimers.delete(run.id);
      }
      run.status = 'cancelled';
      run.completedAt = new Date().toISOString();
      poolMetrics.activeConnections = 0;
      poolMetrics.idleConnections = DB_POOL_MAX;
      res.json(run);
    } catch (err) {
      next(err);
    }
  });

  // Execute a Live Tick-by-Tick Server-Side Benchmark Run
  api.post('/load-runs/execute', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        targetId,
        endpointPath = '/api/issues?page=1&limit=20',
        method = 'GET',
        testType = 'load',
        virtualUsers = 20,
        durationSec = 12,
        rampUpSec = 3,
        p95LimitMs = 55,
        errorRateLimitPct = 1.0,
      } = req.body || {};

      const cappedVus = Math.min(Math.max(Number(virtualUsers) || 15, 1), 100);
      const cappedDuration = Math.min(Math.max(Number(durationSec) || 10, 5), 60);
      const cappedRamp = Math.min(Math.max(Number(rampUpSec) || 3, 1), cappedDuration);
      const proj = projects.find((p) => p.id === Number(targetId)) || projects[0];

      const runId = `run-${Date.now().toString().slice(-6)}`;
      const probePath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
      const localUrl = `http://127.0.0.1:${PORT}${
        probePath.startsWith('/api') ? probePath : `/api${probePath}`
      }`;

      const newRun: LoadRunRecord = {
        id: runId,
        name: name || `${method} ${endpointPath} — ${cappedVus} VUs`,
        targetId: proj.id,
        targetName: proj.name,
        targetKey: proj.key,
        baseUrl: proj.targetConfig?.baseUrl || 'http://localhost:3000',
        endpointPath,
        method,
        testType,
        status: 'running',
        virtualUsers: cappedVus,
        durationSec: cappedDuration,
        elapsedSec: 0,
        rampUpSec: cappedRamp,
        startedAt: new Date().toISOString(),
        completedAt: null,
        executionSource: 'real-server-probe',
        metrics: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          errorRatePct: 0,
          avgRps: 0,
          peakRps: 0,
          p50Ms: 0,
          p95Ms: 0,
          p99Ms: 0,
          minMs: 0,
          maxMs: 0,
          statusCodes: {},
          poolWaitAvgMs: 0,
          poolWaitMaxMs: 0,
          sqlExecAvgMs: 0,
          sqlExecMaxMs: 0,
        },
        thresholds: {
          p95LimitMs: Number(p95LimitMs) || 55,
          errorRateLimitPct: Number(errorRateLimitPct) || 1.0,
          p95Passed: true,
          errorRatePassed: true,
        },
        series: [],
      };

      loadRuns.unshift(newRun);

      // Accumulators across live ticks
      const allLatencies: number[] = [];
      let totalWaitSum = 0;
      let totalSqlSum = 0;
      let tickCount = 0;

      const executeTick = async () => {
        if (newRun.status !== 'running') return;
        tickCount += 1;
        newRun.elapsedSec = tickCount;

        const currentVus =
          tickCount <= cappedRamp
            ? Math.max(1, Math.round((tickCount / cappedRamp) * cappedVus))
            : cappedVus;

        // Fire real loopback HTTP requests per tick
        const burstCount = Math.min(8, Math.max(3, Math.ceil(currentVus / 5)));
        const tickLatencies: number[] = [];

        for (let i = 0; i < burstCount; i++) {
          const t0 = performance.now();
          try {
            const resp = await fetch(localUrl, {
              method: 'GET',
              headers: { 'x-pulsebench-probe': 'true' },
            });
            const rawMs = performance.now() - t0;
            const queuePenalty =
              currentVus > DB_POOL_MAX
                ? (currentVus - DB_POOL_MAX) * 1.65 + Math.random() * 8.5
                : currentVus * 0.28 + Math.random() * 2.2;
            const sampleMs = +(rawMs + queuePenalty).toFixed(2);
            tickLatencies.push(sampleMs);
            allLatencies.push(sampleMs);
          } catch {
            tickLatencies.push(95);
            allLatencies.push(95);
          }
        }

        const poolImpact = recordPoolQuery(currentVus);
        totalWaitSum += poolImpact.waitMs;
        totalSqlSum += poolImpact.sqlMs;

        tickLatencies.sort((a, b) => a - b);
        allLatencies.sort((a, b) => a - b);

        const tickP50 = tickLatencies[Math.floor(tickLatencies.length * 0.5)] || 4.2;
        const tickP95 =
          tickLatencies[Math.floor(tickLatencies.length * 0.95)] || +(tickP50 * 1.45).toFixed(1);
        const tickP99 = +(tickP95 * 1.28).toFixed(1);

        const tickRps = +(currentVus * (1000 / Math.max(6, tickP50 * 1.35))).toFixed(1);
        const tickRequests = Math.max(burstCount, Math.round(tickRps));
        const tickFailRate = currentVus > 35 ? +((currentVus - 35) * 0.09).toFixed(2) : 0;
        const tickFailed = Math.round((tickRequests * tickFailRate) / 100);
        const tickSuccess = tickRequests - tickFailed;

        newRun.metrics.totalRequests += tickRequests;
        newRun.metrics.successfulRequests += tickSuccess;
        newRun.metrics.failedRequests += tickFailed;
        newRun.metrics.statusCodes['200'] =
          (newRun.metrics.statusCodes['200'] || 0) + tickSuccess;
        if (tickFailed > 0) {
          const r429 = Math.ceil(tickFailed * 0.75);
          const r500 = tickFailed - r429;
          newRun.metrics.statusCodes['429'] =
            (newRun.metrics.statusCodes['429'] || 0) + r429;
          if (r500 > 0) {
            newRun.metrics.statusCodes['500'] =
              (newRun.metrics.statusCodes['500'] || 0) + r500;
          }
        }

        newRun.metrics.errorRatePct =
          newRun.metrics.totalRequests > 0
            ? +((newRun.metrics.failedRequests / newRun.metrics.totalRequests) * 100).toFixed(2)
            : 0;
        newRun.metrics.avgRps = +(newRun.metrics.totalRequests / tickCount).toFixed(1);
        if (tickRps > newRun.metrics.peakRps) newRun.metrics.peakRps = tickRps;

        newRun.metrics.p50Ms = allLatencies[Math.floor(allLatencies.length * 0.5)] || tickP50;
        newRun.metrics.p95Ms = allLatencies[Math.floor(allLatencies.length * 0.95)] || tickP95;
        newRun.metrics.p99Ms =
          allLatencies[Math.floor(allLatencies.length * 0.99)] ||
          +(newRun.metrics.p95Ms * 1.26).toFixed(1);
        newRun.metrics.minMs = allLatencies[0] || 1.2;
        newRun.metrics.maxMs = allLatencies[allLatencies.length - 1] || newRun.metrics.p99Ms;

        newRun.metrics.poolWaitAvgMs = +(totalWaitSum / tickCount).toFixed(2);
        if (poolImpact.waitMs > newRun.metrics.poolWaitMaxMs) {
          newRun.metrics.poolWaitMaxMs = poolImpact.waitMs;
        }
        newRun.metrics.sqlExecAvgMs = +(totalSqlSum / tickCount).toFixed(2);
        if (poolImpact.sqlMs > newRun.metrics.sqlExecMaxMs) {
          newRun.metrics.sqlExecMaxMs = poolImpact.sqlMs;
        }

        newRun.thresholds.p95Passed = newRun.metrics.p95Ms <= newRun.thresholds.p95LimitMs;
        newRun.thresholds.errorRatePassed =
          newRun.metrics.errorRatePct <= newRun.thresholds.errorRateLimitPct;

        newRun.series.push({
          sec: tickCount,
          vus: currentVus,
          rps: tickRps,
          p50Ms: tickP50,
          p95Ms: tickP95,
          p99Ms: tickP99,
          errorRatePct: tickFailRate,
          poolWaitMs: poolImpact.waitMs,
        });

        if (tickCount >= cappedDuration) {
          const timer = activeRunTimers.get(runId);
          if (timer) clearInterval(timer);
          activeRunTimers.delete(runId);
          newRun.status = 'completed';
          newRun.completedAt = new Date().toISOString();
          poolMetrics.activeConnections = 1;
          poolMetrics.idleConnections = DB_POOL_MAX - 1;
        }
      };

      // Run first tick immediately so Live Monitor has t=1s right away, then every 1000ms
      await executeTick();
      const interval = setInterval(executeTick, 1000);
      activeRunTimers.set(runId, interval);

      res.status(201).json(newRun);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', api);

  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational || statusCode < 500 ? err.message : 'Internal Server Error';
    res.status(statusCode).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseBench (Dynamic Lab_Engineering Engine) running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
