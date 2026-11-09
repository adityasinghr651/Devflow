import { getStorage } from '../server/storage/index.js';
import { hashPassword, validatePassword } from '../server/security/auth.js';

const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'DevFlow Administrator';
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_BOOTSTRAP_EMAIL to a valid email address.');
const passwordCheck = validatePassword(password);
if (!passwordCheck.valid) throw new Error(`ADMIN_BOOTSTRAP_PASSWORD: ${passwordCheck.error}`);

const storage = getStorage();
await storage.init();
const user = await storage.createFirstAdmin({ email, name, passwordHash: await hashPassword(password) });
console.log(`Created initial administrator ${user.email} (${user.id}). Remove ADMIN_BOOTSTRAP_PASSWORD from the environment now.`);
if (typeof storage.close === 'function') await storage.close();
