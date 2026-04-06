# Memcachify ⚡

**Production-ready, ultra-fast, zero-dependency caching for Node.js.**

Memcachify is a powerful, lightweight caching solution designed for high-performance Express and Fastify APIs. It features a custom LRU engine, background revalidation (SWR), and intelligent stampede prevention.

[![NPM Version](https://img.shields.io/npm/v/memcachify.svg)](https://www.npmjs.com/package/memcachify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🔥 Key Features

- 🏎️ **Ultra-Fast LRU Store**: Custom $O(1)$ implementation with item count and byte-size limits.
- 🔄 **Stale-While-Revalidate (SWR)**: Serve stale data instantly while fetching fresh data in the background.
- 🛡️ **Stampede Prevention**: Automatic promise coalescing to prevent "Thundering Herd" effects on your database.
- 🌐 **HTTP Protocol Compliant**: Full support for `Vary`, `ETag`, `If-None-Match`, and `Cache-Control` headers.
- 📈 **Observability**: Built-in stats tracking (hit rate, evictions) and event hooks (`hit`, `miss`, `evict`).
- 🏷️ **Tag-based Invalidation**: Invalidate multiple entries at once using custom tags.
- 📦 **Zero Dependencies**: Core logic is 100% dependency-free for maximum security and minimal footprint.
- 🖥️ **Universal Support**: Works in Node.js, browsers (localStorage persistence), and Edge workers.

---

## 🚀 Installation

```bash
npm install memcachify
```

---

## 📖 Usage Examples

### 1. Express Middleware

The easiest way to cache your routes. Memcachify automatically handles headers and status codes.

```ts
import express from 'express';
import { cache, invalidate } from 'memcachify';

const app = express();

// Cache for 60 seconds
app.get('/api/products', cache({ ttl: 60 }), (req, res) => {
  res.json({ products: [...] });
});

// Manual invalidation
app.post('/api/products', (req, res) => {
  invalidate((key) => key.includes('/api/products'));
  res.status(201).send('Created');
});
```

### 2. Advanced: Stale-While-Revalidate (SWR)

Keep your API responsive even when the cache expires. SWR serves the stale data while refreshing the cache in the background.

```ts
app.get('/api/trending', cache({
  ttl: 30,
  staleWhileRevalidate: 300, // Serve stale up to 5 mins
  revalidate: async (req) => {
    const data = await db.getTrending();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: data };
  }
}), (req, res) => {
  // Initial request handler
});
```

### 3. Fastify Middleware

```ts
import Fastify from 'fastify';
import { fastifyCache, InMemoryStore } from 'memcachify';

const fastify = Fastify();
const store = new InMemoryStore({ maxItems: 5000 });

fastify.register(fastifyCache({ store, ttl: 60 }));

fastify.get('/users', async (req, reply) => {
  return { users: [] };
});
```

### 4. Browser / Client Cache

MEMcachify comes with a separate client-side bundle that supports `localStorage` persistence.

```ts
import { ClientCache } from 'memcachify/client';

const clientCache = new ClientCache({ 
  ttlMs: 60_000, 
  storageKeyPrefix: 'myapp:' 
});

clientCache.set('user_profile', { name: 'Alice' });
const user = clientCache.get('user_profile');
```

---

## 🛠️ Advanced Configuration

### Store Options

Configure the `InMemoryStore` with strict limits to prevent memory leaks.

```ts
const store = new InMemoryStore({
  maxItems: 10000,           // Max number of entries
  maxSize: 100 * 1024 * 1024, // 100MB byte limit
  defaultTTL: 300,            // 5 minutes
  cleanupIntervalMs: 60000,   // Frequency of expired key cleanup
  logger: console             // Pino-compatible logger
});

// Observability
store.on('hit', (key) => console.log(`Cache Hit: ${key}`));
store.on('evict', (key) => console.warn(`Cache Evicted: ${key}`));

console.log(store.stats()); // { hits, misses, evictions, hitRate, ... }
```

### Invalidation

```ts
store.invalidateByTag('category:electronics'); // Invalidate everything tagged
store.invalidate((key) => key.startsWith('/api/v1')); // Predicate-based
store.clear(); // Nuclear option
```

---

## 🤝 Collaboration & Support

Memcachify is open-source and welcoming to contributions!

- **🐛 Issues**: Found a bug or have a feature request? [Open an issue](https://github.com/darshan1005/memcachify/issues).
- **🙋 Collaboration**: Want to help out? Feel free to fork the repo and submit a PR. See our [Contribution Guide](CONTRIBUTING.md) for more details.
- **⭐ Support**: If you find this project useful, please give it a star on GitHub!

---

## 📜 License

MIT © [Darshan Battula](https://github.com/darshan1005)
