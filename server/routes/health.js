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

