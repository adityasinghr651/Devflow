import express from 'express';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { targetsRouter } from './routes/targets.js';
import { runsRouter } from './routes/runs.js';
import { campaignsRouter } from './routes/campaigns.js';
import { adminRouter } from './routes/admin.js';
import { randomUUID } from 'node:crypto';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] && /^[\w.-]{1,80}$/.test(req.headers['x-request-id'])
      ? req.headers['x-request-id'] : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.on('finish', () => {
      console.log(JSON.stringify({ level: 'info', event: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode }));
    });
    next();
  });
  app.use(express.json({ limit: '64kb', strict: true }));
  app.use((req, res, next) => {
    if (req.path === '/api' || (req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/'))) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', '2027-11-04');
    }
    next();
  });

  // Security headers & CORS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Mount API routers
  for (const prefix of ['/api', '/api/v1']) {
    app.use(prefix, healthRouter);
    app.use(prefix, authRouter);
    app.use(prefix, targetsRouter);
    app.use(prefix, runsRouter);
    app.use(prefix, campaignsRouter);
    app.use(prefix, adminRouter);
  }

  // Error handling middleware
  app.use((err, req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({ error: 'Request body exceeds allowable maximum size limit (64KB).' });
    }
    console.error(JSON.stringify({ level: 'error', event: 'api_error', requestId: req.requestId, message: err.message || 'Unhandled request error' }));
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
