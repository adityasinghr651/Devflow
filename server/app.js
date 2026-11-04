import express from 'express';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { targetsRouter } from './routes/targets.js';
import { runsRouter } from './routes/runs.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb', strict: true }));

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
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Mount API routers
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', targetsRouter);
  app.use('/api', runsRouter);

  // Error handling middleware
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({ error: 'Request body exceeds allowable maximum size limit (64KB).' });
    }
    console.error('[ServerTest API Error]:', err.message || 'Unhandled request error');
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
