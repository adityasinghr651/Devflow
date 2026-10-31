import { createApp } from './server/app.js';
import { config } from './server/config.js';
import { getStorage } from './server/storage/index.js';
import { getRunnerManager } from './server/runner/manager.js';

async function bootstrap() {
  const storage = getStorage();
  await storage.init();

  const runner = getRunnerManager(storage);
  await runner.startupRecovery();

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    console.log(`ServerTest API listening on http://${config.host}:${config.port}`);
    console.log(`Storage engine: ${storage.getHealthInfo().storage}`);
  });

  const shutdown = async (signal) => {
    console.log(`[ServerTest] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      console.log('[ServerTest] HTTP server closed.');
      if (typeof storage.close === 'function') {
        await storage.close();
        console.log('[ServerTest] Database connections closed.');
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('[ServerTest] Fatal startup error:', err);
  process.exit(1);
});
