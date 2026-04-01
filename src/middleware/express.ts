import type { Request, Response, NextFunction } from 'express';
import { defaultKeyGenerator } from '../utils/key.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';

export interface CacheOptions {
  ttl?: number;
  key?: (req: Request) => string;
  enabled?: (req: Request, res: Response) => boolean;
  store?: InMemoryStore;
  methods?: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
}

const defaultOptions: Required<Pick<CacheOptions, 'ttl' | 'key' | 'enabled' | 'methods'>> = {
  ttl: 60,
  key: defaultKeyGenerator,
  enabled: () => true,
  methods: ['GET', 'HEAD']
};

export function expressCache(options: CacheOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const { ttl, key, enabled, store, methods } = {
    ...defaultOptions,
    ...options
  };

  if (!store) {
    throw new Error('expressCache requires a store implementer in options.store');
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method as any) || !enabled(req, res)) {
      return next();
    }

    const cacheKey = key(req);
    const cached = store.get(cacheKey);

    if (cached) {
      res.status(cached.statusCode);
      Object.entries(cached.headers).forEach(([name, value]) => {
        res.setHeader(name, value);
      });
      return res.send(cached.body);
    }

    const originalSend = res.send.bind(res);
    let outgoingBody: Buffer | string | undefined;

    res.send = (body?: any): Response => {
      outgoingBody = body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalSend(body as any);
    };

    const onFinish = () => {
      res.removeListener('finish', onFinish);
      if (!outgoingBody) return;

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const normalizedBody = Buffer.isBuffer(outgoingBody) ? outgoingBody : Buffer.from(String(outgoingBody));
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(',');
          }
        }

        store.set(cacheKey, {
          statusCode: res.statusCode,
          headers,
          body: normalizedBody
        }, ttl);
      }
    };

    res.on('finish', onFinish);
    return next();
  };
}
