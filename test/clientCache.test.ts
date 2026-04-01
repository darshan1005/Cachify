import { ClientCache } from '../src/client/clientCache.js';

describe('ClientCache', () => {
  it('stores and retrieves in-memory values', () => {
    const cache = new ClientCache<{ hello: string }>({ ttlMs: 1000 });
    cache.set('x', { hello: 'world' });

    expect(cache.get('x')).toEqual({ hello: 'world' });
  });

  it('expires entries after ttl', async () => {
    const cache = new ClientCache<{ value: number }>({ ttlMs: 10 });
    cache.set('y', { value: 1 });
    expect(cache.get('y')).toEqual({ value: 1 });

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(cache.get('y')).toBeUndefined();
  });

  it('delete and clear remove values', () => {
    const cache = new ClientCache({ ttlMs: 1000 });
    cache.set('a', 'a');
    cache.set('b', 'b');

    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('b');

    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});
