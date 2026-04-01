# Cachify

Lightweight in-memory caching middleware for Node.js APIs (Express + Fastify-ready).

## Features

- In-memory Map store with O(1) lookups
- TTL-based expiration
- Cache invalidation by key or predicate
- Auto cleanup of expired entries
- Express middleware with painless integration
- API for custom store adapters in future

## Install

```bash
npm install cachify
```

## Quick start (Express)

```ts
import express from 'express';
import { cache, invalidate, clearCache } from 'cachify';

const app = express();

app.get('/users', cache({ ttl: 60 }), (req, res) => {
  res.json({ data: [1, 2, 3] });
});

app.post('/users', (req, res) => {
  // write logic...
  invalidate((key) => key.includes('/users'));
  res.status(201).send('created');
});

app.listen(3000);
```

## Fastify

```ts
import Fastify from 'fastify';
import { fastifyCache } from 'cachify';

const app = Fastify();
const store = new InMemoryStore({ defaultTTL: 60 });

await app.register(fastifyCache({ store }));

app.get('/users', async () => ({ data: [1,2,3] }));
```

## Client cache helper

```ts
import { ClientCache } from 'cachify';

const cache = new ClientCache<{ data: string }>({ ttlMs: 60_000 });
cache.set('userCache', { data: 'hello' });
const value = cache.get('userCache');
console.log(value);
```

## Proxy cache helper

```ts
import { InMemoryStore, fetchWithCache } from 'cachify';

const store = new InMemoryStore({ defaultTTL: 60 });
const response = await fetchWithCache('https://httpbin.org/get', {}, { store, ttl: 60 });
if (response.cached) console.log('from cache');
```

## API

- `cache(options?)` — Express middleware (default TTL 60s).
- `invalidate(keyOrPredicate)` — invalidate a key or predicate in shared store.
- `clearCache()` — flush all entries.
- `InMemoryStore` — class for custom stores or multiple stores.

## Build & test

```bash
npm install
npm run build
npm run test
```

