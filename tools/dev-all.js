import { spawn } from 'node:child_process';

const services = [
  { name: 'API', args: ['server.js'] },
  { name: 'Controlled test target', args: ['tools/test-target.js'] },
  { name: 'Web UI', args: ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '3000'] },
];

let stopping = false;
let stopTimer;
const children = services.map(service => {
  const child = spawn(process.execPath, service.args, { stdio: 'inherit', env: process.env });
  child.serviceName = service.name;
  child.once('error', error => {
    console.error(`[DevFlow] Could not start ${service.name}: ${error.message}`);
    stopAll(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[DevFlow] ${service.name} exited${signal ? ` from ${signal}` : ` with code ${code}`}. Stopping the other services.`);
      stopAll(code || 1);
    }
  });
  return child;
});

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  stopTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 5000);
  stopTimer.unref();
  Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  }))).then(() => clearTimeout(stopTimer));
}

process.once('SIGINT', () => stopAll());
process.once('SIGTERM', () => stopAll());

console.log('[DevFlow] Starting the API, controlled test target, and web UI.');
console.log('[DevFlow] UI: http://localhost:3000 | API: http://127.0.0.1:4000 | Test target: http://127.0.0.1:5050');
console.log('[DevFlow] Press Ctrl+C to stop all services.');
