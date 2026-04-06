export { InMemoryStore } from './store/inMemoryStore.js';
export * from './store/types.js';
export { type CacheOptions, expressCache } from './middleware/express.js';
export { type FastifyCacheOptions, fastifyCache } from './middleware/fastify.js';
export { fetchWithCache, type FetchCacheOptions } from './utils/proxy.js';
export { ClientCache, type ClientCacheOptions, type ClientCacheEntry } from './client/clientCache.js';
export { defaultKeyGenerator } from './utils/key.js';

import { expressCache } from './middleware/express.js';
import { InMemoryStore as DefaultStoreClass } from './store/inMemoryStore.js';

const defaultStore = new DefaultStoreClass({ defaultTTL: 60 });

export const cache = (options: Partial<import('./middleware/express.js').CacheOptions> = {}) => {
  return expressCache({ ...options, store: options.store ?? defaultStore });
};

export const invalidate = (keyOrPredicate: string | ((key: string) => boolean)) => {
  return defaultStore.invalidate(keyOrPredicate);
};

export const clearCache = () => {
  defaultStore.clear();
};

export const getCacheStore = () => defaultStore;
