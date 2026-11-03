import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEnvironmentFile } from './server/environment.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const envFile = findEnvironmentFile(projectRoot);

export default defineConfig({
  root: projectRoot,
  envDir: envFile ? path.dirname(envFile) : projectRoot,
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000 },
});
