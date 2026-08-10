// src/api/cache.js — cache simple en memoria (sin React Query por ahora)
const stores = new Map();

export function cacheGet(key) {
  return stores.get(key);
}

export function cacheSet(key, value) {
  stores.set(key, value);
  return value;
}

export function cacheInvalidate(prefix) {
  for (const k of stores.keys()) {
    if (k.startsWith(prefix)) stores.delete(k);
  }
}
