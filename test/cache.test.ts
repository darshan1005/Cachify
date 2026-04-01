import express from 'express';
import request from 'supertest';
import { InMemoryStore, cache, clearCache } from '../src/index.js';

describe('Cachify - core behavior', () => {
  afterEach(() => {
    clearCache();
  });

  it('caches GET responses and returns cached payload', async () => {
    const app = express();
    let calls = 0;

    app.get('/hello', cache(), (req, res) => {
      calls += 1;
      res.json({ called: calls, value: 'world' });
    });

    const first = await request(app).get('/hello');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ called: 1, value: 'world' });

    const second = await request(app).get('/hello');
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ called: 1, value: 'world' });
    expect(calls).toBe(1);
  });

  it('respects TTL expiration', async () => {
    const store = new InMemoryStore({ defaultTTL: 1 });
    const app = express();
    let calls = 0;

    app.get('/fast', cache({ store, ttl: 1 }), (req, res) => {
      calls += 1;
      res.send('ok');
    });

    const first = await request(app).get('/fast');
    expect(first.text).toBe('ok');

    const second = await request(app).get('/fast');
    expect(second.text).toBe('ok');
    expect(calls).toBe(1);

    await new Promise((r) => setTimeout(r, 1100));

    const third = await request(app).get('/fast');
    expect(third.text).toBe('ok');
    expect(calls).toBe(2);
  });
});
