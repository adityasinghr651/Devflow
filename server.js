import { createApp } from './server/app.js';
import { config } from './server/config.js';
import { getStorage } from './server/storage/index.js';
import { getRunnerManager } from './server/runner/manager.js';

async function bootstrap() {
  const storage = getStorage();
  await storage.init();
  const storageInfo = await storage.getHealthInfo();

  const runner = getRunnerManager(storage);
  await runner.startupRecovery();

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    console.log(`ServerTest API listening on http://${config.host}:${config.port}`);
    console.log(`Storage engine: ${storageInfo.storage}`);
  });

  const shutdown = async (signal) => {
    console.log(`[ServerTest] Received ${signal}, shutting down gracefully...`);
    const serverClosed = new Promise(resolve => server.close(resolve));
    const outcome = await runner.shutdown(8000);
    if (outcome.timedOut) console.error(JSON.stringify({ level: 'error', event: 'shutdown_timeout', timeoutMs: 8000 }));
    await serverClosed;
    if (typeof storage.close === 'function') await storage.close();
    console.log('[ServerTest] Graceful shutdown complete.');
    process.exit(outcome.timedOut ? 1 : 0);
  };

  let shuttingDown = false;
  const handleShutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdown(signal).catch(err => {
      console.error(JSON.stringify({ level: 'error', event: 'shutdown_failed', message: err.message }));
      process.exit(1);
    });
  };
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('[ServerTest] Fatal startup error:', err);
  process.exit(1);
});
