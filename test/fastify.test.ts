import Fastify from 'fastify';
import { InMemoryStore, fastifyCache, fetchWithCache } from '../src/index.js';
import http from 'http';

describe('Cachify Fastify and proxy path', () => {
  it('caches Fastify responses', async () => {
    const store = new InMemoryStore({ defaultTTL: 60 });
    const app = Fastify();

    let hits = 0;
    app.get('/hello', { preHandler: fastifyCache({ store }) }, async () => {
      hits += 1;
      return { hello: 'world', hits };
    });

    await app.ready();

    const first = await app.inject({ method: 'GET', url: '/hello' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ hello: 'world', hits: 1 });

    const second = await app.inject({ method: 'GET', url: '/hello' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ hello: 'world', hits: 1 });

    expect(hits).toBe(1);

    await app.close();
  });

  it('fetchWithCache caches upstream fetch responses', async () => {
    const store = new InMemoryStore({ defaultTTL: 60 });

    const server = http.createServer((req, res) => {
      if (req.url === '/api') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: 'ok' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to get server address');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const first = await fetchWithCache(`${baseUrl}/api`, {}, { store, ttl: 60 });
    expect(first.cached).toBe(false);
    expect(first.status).toBe(200);
    expect(JSON.parse(first.body.toString())).toEqual({ value: 'ok' });

    const second = await fetchWithCache(`${baseUrl}/api`, {}, { store, ttl: 60 });
    expect(second.cached).toBe(true);
    expect(second.status).toBe(200);

    server.close();
  });
});
