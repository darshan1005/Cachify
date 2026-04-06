import type { FastifyReply, FastifyRequest } from 'fastify';
import { defaultKeyGenerator } from '../utils/key.js';
import type { ICacheStore, CacheValue } from '../store/types.js';

export interface FastifyCacheOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
  revalidate?: (req: FastifyRequest) => Promise<{ statusCode: number; headers: Record<string, string>; body: any }>;
  key?: (req: FastifyRequest) => string;
  enabled?: (req: FastifyRequest, reply: FastifyReply) => boolean;
  store: ICacheStore;
  methods?: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
}

const defaultOptions: Required<Pick<FastifyCacheOptions, 'ttl' | 'key' | 'enabled' | 'methods'>> = {
  ttl: 60,
  key: (req: FastifyRequest) => defaultKeyGenerator(req as any),
  enabled: () => true,
  methods: ['GET', 'HEAD']
};

const inFlight = new Map<string, Promise<any>>();
const revalidating = new Set<string>();

export function fastifyCache(options: FastifyCacheOptions): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { ttl, staleWhileRevalidate, revalidate, key, enabled, store, methods } = {
    ...defaultOptions,
    ...options
  };

  if (!store) {
    throw new Error('fastifyCache requires options.store');
  }

  function isStale(entry: CacheValue): boolean {
    if (!staleWhileRevalidate) return false;
    return Date.now() > entry.expiresAt;
  }

  function revalidateInBackground(cacheKey: string, req: FastifyRequest, s: ICacheStore): void {
    if (revalidating.has(cacheKey) || !revalidate) return;
    revalidating.add(cacheKey);

    setImmediate(() => {
      revalidate(req)
        .then((fresh) => {
          s.set(cacheKey, {
            statusCode: fresh.statusCode,
            headers: fresh.headers,
            body: Buffer.isBuffer(fresh.body) ? fresh.body : Buffer.from(typeof fresh.body === 'string' ? fresh.body : JSON.stringify(fresh.body))
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

  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!methods.includes(req.method as any) || !enabled(req, reply)) {
      return;
    }

    const cacheKey = key(req);

    // Respect Cache-Control request headers
    const cacheControl = req.headers['cache-control'];
    if (cacheControl && (cacheControl.includes('no-store') || cacheControl.includes('no-cache'))) {
      return;
    }

    const cached = store.get(cacheKey);

    const s = store!; // Non-null assertion as it's checked above

    if (cached) {
      // ...
      if (isStale(cached)) {
        const staleLimit = cached.expiresAt + (staleWhileRevalidate || 0) * 1000;
        if (Date.now() <= staleLimit) {
          revalidateInBackground(cacheKey, req, s);
          reply.header('X-Cache', 'STALE');
        } else {
          return proceed();
        }
      }

      Object.entries(cached.headers).forEach(([name, value]) => {
        reply.header(name, value);
      });

      if (req.method === 'HEAD') {
        await reply.code(cached.statusCode).send();
        return;
      }

      await reply.code(cached.statusCode).send(cached.body);
      return;
    }

    async function proceed() {
      // Stampede Prevention
      if (inFlight.has(cacheKey)) {
        const result = await inFlight.get(cacheKey);
        if (result) {
          reply.header('X-Cache', 'HIT');
          Object.entries(result.headers).forEach(([name, value]) => {
            reply.header(name, value as string);
          });
          if (req.method === 'HEAD') {
            await reply.code(result.statusCode).send();
            return;
          }
          await reply.code(result.statusCode).send(result.body);
          return;
        }
        return;
      }

      let resolveInFlight: (value: any) => void;
      inFlight.set(cacheKey, new Promise((resolve) => { resolveInFlight = resolve; }));

      const originalSend = reply.send.bind(reply);

      reply.send = (async (payload: unknown): Promise<FastifyReply> => {
        let cacheValue: any = null;

        if (!reply.sent && reply.raw.statusCode >= 200 && reply.raw.statusCode < 300 && (payload != null)) {
          const resCacheControl = reply.getHeader('cache-control') as string;
          if (!resCacheControl || (!resCacheControl.includes('no-store') && !resCacheControl.includes('no-cache'))) {
            const headers: Record<string, string> = {};
            for (const [name, value] of Object.entries(reply.getHeaders())) {
              if (typeof value === 'string') headers[name] = value;
              else if (Array.isArray(value)) headers[name] = value.join(',');
            }

            const bodyBuffer = typeof payload === 'string' ? Buffer.from(payload) : Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));

            cacheValue = {
              statusCode: reply.raw.statusCode,
              headers,
              body: bodyBuffer
            };

            store.set(cacheKey, cacheValue, ttl);
          }
        }

        resolveInFlight(cacheValue);
        inFlight.delete(cacheKey);

        if (req.method === 'HEAD') {
          return originalSend();
        }

        return originalSend(payload);
      }) as any;

      reply.raw.on('close', () => {
        if (inFlight.has(cacheKey)) {
          resolveInFlight(null);
          inFlight.delete(cacheKey);
        }
      });

      reply.header('X-Cache', 'MISS');
    }

    return proceed();
  };
}
