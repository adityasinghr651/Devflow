import { config } from '../config.js';
import { JsonStorage } from './json-storage.js';
import { PgStorage } from './postgres-storage.js';

let storageInstance = null;

export function getStorage() {
  if (!storageInstance) {
    if (config.databaseUrl) {
      storageInstance = new PgStorage(config.databaseUrl, {
        max: config.dbPoolMax,
        min: config.dbPoolMin,
      });
    } else {
      storageInstance = new JsonStorage(config.dataDir);
    }
  }
  return storageInstance;
}

export function setStorage(customStorage) {
  storageInstance = customStorage;
}
