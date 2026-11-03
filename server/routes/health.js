import express from 'express';
import { getStorage } from '../storage/index.js';

export const healthRouter = express.Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    const storage = getStorage();
    const info = storage.getHealthInfo ? await storage.getHealthInfo() : { storage: 'local-json' };
    const healthy = info.healthy !== false;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      service: 'DevFlow API',
      storage: info.storage || 'local-json',
      persistence: info.storage === 'postgresql' ? 'database' : 'local-file',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

