import type { FastifyReply, FastifyRequest, FastifyInstance, HookHandlerDoneFunction } from 'fastify';
import { defaultKeyGenerator } from '../utils/key.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';

export interface FastifyCacheOptions {
  ttl?: number;
  key?: (req: FastifyRequest) => string;
  enabled?: (req: FastifyRequest, reply: FastifyReply) => boolean;
  store: InMemoryStore;
  methods?: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
}

const defaultOptions: Required<Pick<FastifyCacheOptions, 'ttl' | 'key' | 'enabled' | 'methods'>> = {
  ttl: 60,
  key: (req: FastifyRequest) => defaultKeyGenerator(req as any),
  enabled: () => true,
  methods: ['GET', 'HEAD']
};

export function fastifyCache(options: FastifyCacheOptions): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { ttl, key, enabled, store, methods } = {
    ...defaultOptions,
    ...options
  };

  if (!store) {
    throw new Error('fastifyCache requires options.store');
  }

  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!methods.includes(req.method as any) || !enabled(req, reply)) {
      return;
    }

    const cacheKey = key(req);
    const cached = store.get(cacheKey);

    if (cached) {
      Object.entries(cached.headers).forEach(([name, value]) => {
        reply.header(name, value);
      });

      await reply.code(cached.statusCode).send(cached.body);
      return;
    }

    // decorate request for later caching in onSend hook
    (req as any).cacheKey = cacheKey;

    const originalSend = reply.send.bind(reply);

    reply.send = ((payload: unknown): FastifyReply => {
      if (!reply.sent && reply.raw.statusCode >= 200 && reply.raw.statusCode < 300 && (payload != null)) {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(reply.getHeaders())) {
          if (typeof value === 'string') headers[name] = value;
          else if (Array.isArray(value)) headers[name] = value.join(',');
        }

        const bodyBuffer = typeof payload === 'string' ? Buffer.from(payload) : Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));

        store.set(cacheKey, {
          statusCode: reply.raw.statusCode,
          headers,
          body: bodyBuffer
        }, ttl);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalSend as any)(payload);
    }) as typeof reply.send;
  };
}
