import express from 'express';
import { getStorage } from '../storage/index.js';

export const healthRouter = express.Router();

healthRouter.get('/health', async (_req, res) => {
  const storage = getStorage();
  const info = storage.getHealthInfo ? storage.getHealthInfo() : { storage: 'local-json' };
  res.json({
    status: 'ok',
    service: 'ServerTest API',
    storage: info.storage || 'local-json',
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (_req, res) => {
  const storage = getStorage();
  try {
    await storage.checkHealth?.();
    res.json({ status: 'ready', storage: storage.getHealthInfo?.().storage || 'local-json' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

