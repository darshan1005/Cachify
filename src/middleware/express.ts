import type { Request, Response, NextFunction } from 'express';
import { defaultKeyGenerator } from '../utils/key.js';
import type { ICacheStore, CacheValue } from '../store/types.js';

export interface CacheOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
  revalidate?: (req: Request) => Promise<{ statusCode: number; headers: Record<string, string>; body: any }>;
  key?: (req: Request) => string;
  enabled?: (req: Request, res: Response) => boolean;
  store?: ICacheStore;
  methods?: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
}

const defaultOptions: Required<Pick<CacheOptions, 'ttl' | 'key' | 'enabled' | 'methods'>> = {
  ttl: 60,
  key: defaultKeyGenerator,
  enabled: () => true,
  methods: ['GET', 'HEAD']
};

const inFlight = new Map<string, Promise<any>>();
const revalidating = new Set<string>();

export function expressCache(options: CacheOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const { ttl, staleWhileRevalidate, revalidate, key, enabled, store, methods } = {
    ...defaultOptions,
    ...options
  };

  if (!store) {
    throw new Error('expressCache requires a store implementer in options.store');
  }

  const s = store;

  function isStale(entry: CacheValue): boolean {
    if (!staleWhileRevalidate) return false;
    return Date.now() > entry.expiresAt;
  }

  function revalidateInBackground(cacheKey: string, req: Request, s: ICacheStore): void {
    if (revalidating.has(cacheKey) || !revalidate) return;
    revalidating.add(cacheKey);

    setImmediate(() => {
      revalidate(req)
        .then((fresh) => {
          s.set(cacheKey, {
            statusCode: fresh.statusCode,
            headers: fresh.headers,
            body: Buffer.isBuffer(fresh.body) ? fresh.body : Buffer.from(String(fresh.body))
          }, ttl);
        })
        .catch(() => {
          // ignore background errors
        })
        .finally(() => {
          revalidating.delete(cacheKey);
        });
    });
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method as any) || !enabled(req, res)) {
      return next();
    }

    const cacheKey = key(req);
    const s = store!; // Non-null assertion as it's checked above

    // Respect Cache-Control request headers
    const cacheControl = req.get('cache-control');
    if (cacheControl && (cacheControl.includes('no-store') || cacheControl.includes('no-cache'))) {
      return next();
    }

    const cached = s.get(cacheKey);

    if (cached) {
      const etag = cached.headers['etag'];
      const lastModified = cached.headers['last-modified'];

      if (req.header('if-none-match') && etag === req.header('if-none-match')) {
        return res.status(304).end();
      }

      if (req.header('if-modified-since') && lastModified === req.header('if-modified-since')) {
        return res.status(304).end();
      }

      // SWR check
      if (isStale(cached)) {
        const staleLimit = cached.expiresAt + (staleWhileRevalidate || 0) * 1000;
        if (Date.now() <= staleLimit) {
          revalidateInBackground(cacheKey, req, s);
          // serve stale
          res.setHeader('X-Cache', 'STALE');
        } else {
          // expired completely
          return proceed();
        }
      } else {
        res.setHeader('X-Cache', 'HIT');
      }

      res.status(cached.statusCode);
      Object.entries(cached.headers).forEach(([name, value]) => {
        res.setHeader(name, value);
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      return res.send(cached.body);
    }

    function proceed() {
      // Stampede Prevention
      if (inFlight.has(cacheKey)) {
        inFlight.get(cacheKey)!.then((result) => {
          if (result) {
            res.setHeader('X-Cache', 'HIT');
            res.status(result.statusCode);
            Object.entries(result.headers).forEach(([name, value]) => res.setHeader(name, value as string));
            if (req.method === 'HEAD') return res.end();
            return res.send(result.body);
          }
          return next();
        });
        return;
      }

      let resolveInFlight: (value: any) => void;
      inFlight.set(cacheKey, new Promise((resolve) => { resolveInFlight = resolve; }));

      const originalSend = res.send.bind(res);
      let outgoingBody: Buffer | string | undefined;

      res.send = (body?: any): Response => {
        outgoingBody = body;
        return originalSend(body as any);
      };

      const originalEnd = res.end.bind(res);
      res.end = (chunk?: any, encoding?: any, cb?: any): any => {
        if (!outgoingBody && chunk) outgoingBody = chunk;
        return originalEnd(chunk, encoding, cb);
      };

      const onFinish = () => {
        res.removeListener('finish', onFinish);
        res.removeListener('close', onClose);

        let cacheValue: any = null;

        if (res.statusCode >= 200 && res.statusCode < 300) {
          const resCacheControl = res.get('cache-control');
          if (!resCacheControl || (!resCacheControl.includes('no-store') && !resCacheControl.includes('no-cache'))) {
            const normalizedBody = Buffer.isBuffer(outgoingBody) ? outgoingBody : Buffer.from(String(outgoingBody || ''));
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.getHeaders())) {
              if (typeof v === 'string') headers[k] = v;
              else if (Array.isArray(v)) headers[k] = v.join(',');
            }

            cacheValue = {
              statusCode: res.statusCode,
              headers,
              body: normalizedBody
            };

            s.set(cacheKey, cacheValue, ttl);
          }
        }

        resolveInFlight(cacheValue);
        inFlight.delete(cacheKey);
      };

      const onClose = () => {
        res.removeListener('finish', onFinish);
        res.removeListener('close', onClose);
        resolveInFlight(null);
        inFlight.delete(cacheKey);
      };

      res.on('finish', onFinish);
      res.on('close', onClose);
      res.setHeader('X-Cache', 'MISS');
      next();
    }

    return proceed();
  };
}
