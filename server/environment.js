import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export function findEnvironmentFile(startDirectory) {
  let current = path.resolve(startDirectory);
  // Worktrees may live a couple of directories below the checkout that owns .env.
  for (let depth = 0; depth <= 3; depth += 1) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function loadEnvironment(startDirectory) {
  const envFile = findEnvironmentFile(startDirectory);
  if (envFile) dotenv.config({ path: envFile });
  return envFile;
}
