import { defaultKeyGenerator } from './key.js';
import type { ICacheStore } from '../store/types.js';

export interface FetchCacheOptions {
  store: ICacheStore;
  ttl?: number;
  key?: (req: { method: string; url: string; query?: Record<string, any>; body?: any }) => string;
}

export async function fetchWithCache(input: RequestInfo, init: RequestInit = {}, options: FetchCacheOptions) {
  const { store, ttl = 60, key = defaultKeyGenerator as any } = options;

  const url = typeof input === 'string' ? input : input.toString();
  const requestMethod = (init.method || 'GET').toUpperCase();

  const cacheKey = key({ method: requestMethod, url });
  const cached = store.get(cacheKey);
  if (cached) {
    return {
      cached: true,
      status: cached.statusCode,
      headers: cached.headers,
      body: cached.body
    };
  }

  const response = await fetch(input, init);
  const responseBody = await response.arrayBuffer();
  const bodyBuffer = Buffer.from(responseBody);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  if (response.ok) {
    store.set(cacheKey, {
      statusCode: response.status,
      headers,
      body: bodyBuffer
    }, ttl);
  }

  return {
    cached: false,
    status: response.status,
    headers,
    body: bodyBuffer
  };
}
