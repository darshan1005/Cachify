import { EventEmitter } from 'events';
import type { CacheValue, CacheStoreOptions, ICacheStore } from './types.js';
import { LRUList } from './lruList.js';

export class InMemoryStore extends EventEmitter implements ICacheStore {
  private lru: LRUList<string, CacheValue>;
  private defaultTTL: number;
  private cleanupIntervalMs: number;
  private cleanupTimer?: NodeJS.Timeout;
  private maxByteSize: number;
  private currentByteSize = 0;
  private logger?: CacheStoreOptions['logger'];

  public hits = 0;
  public misses = 0;
  public evictions = 0;

  constructor(options: CacheStoreOptions = {}) {
    super();
    this.defaultTTL = options.defaultTTL ?? 60;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 30_000;
    this.maxByteSize = options.maxSize ?? Infinity;
    this.logger = options.logger;
    this.lru = new LRUList<string, CacheValue>(options.maxItems ?? 10_000);
    this.startCleanup();
  }

  get(key: string): CacheValue | undefined {
    const entry = this.lru.get(key);
    if (!entry) {
      this.misses++;
      this.emit('miss', key);
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      this.misses++;
      this.emit('miss', key);
      this.emit('expire', key);
      return undefined;
    }

    // Sliding TTL logic: reset expiry on access
    const now = Date.now();
    const ttl = (entry.expiresAt - entry.createdAt) / 1000;
    entry.expiresAt = now + ttl * 1000;
    entry.createdAt = now;

    this.hits++;
    this.emit('hit', key, entry);
    return entry;
  }

  set(key: string, value: Omit<CacheValue, 'createdAt' | 'expiresAt'>, ttlSeconds?: number): void {
    const now = Date.now();
    const ttl = ttlSeconds ?? this.defaultTTL;
    const expiresAt = now + ttl * 1000;
    const entry: CacheValue = {
      ...value,
      createdAt: now,
      expiresAt
    };

    const entrySize = this.calculateEntrySize(key, entry);
    
    // Evict items if byte size exceeded
    while (this.currentByteSize + entrySize > this.maxByteSize && this.lru.size > 0) {
      this.evictOne();
    }

    const evictedNode = this.lru.set(key, entry);
    if (evictedNode) {
      this.evictions++;
      this.currentByteSize -= this.calculateEntrySize(evictedNode.key, evictedNode.value);
      this.emit('evict', evictedNode.key);
      this.logger?.debug?.(`Evicted key due to item count limit: ${evictedNode.key}`);
    }

    this.currentByteSize += entrySize;
    this.emit('set', key, entry);
    this.logger?.debug?.(`Set key: ${key}, size: ${entrySize} bytes`);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    const entry = this.lru.get(key);
    if (entry) {
      this.currentByteSize -= this.calculateEntrySize(key, entry);
      const deleted = this.lru.delete(key);
      if (deleted) {
        this.emit('delete', key);
        this.logger?.debug?.(`Deleted key: ${key}`);
      }
      return deleted;
    }
    return false;
  }

  clear(): void {
    this.lru.clear();
    this.currentByteSize = 0;
    this.emit('clear');
    this.logger?.info?.('Cache cleared');
  }

  invalidate(keyOrPredicate: string | ((key: string) => boolean)): number {
    let deleted = 0;
    if (typeof keyOrPredicate === 'string') {
      if (this.delete(keyOrPredicate)) deleted = 1;
      return deleted;
    }

    for (const key of Array.from(this.lru.keys())) {
      if (keyOrPredicate(key)) {
        if (this.delete(key)) deleted += 1;
      }
    }

    return deleted;
  }

  invalidateByTag(tag: string): number {
    let deleted = 0;
    for (const [key, value] of this.lru.entries()) {
      if (value.tags?.includes(tag)) {
        if (this.delete(key)) deleted++;
      }
    }
    this.logger?.info?.(`Invalidated ${deleted} entries with tag: ${tag}`);
    return deleted;
  }

  size(): number {
    return this.lru.size;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      currentSize: this.size(),
      currentByteSize: this.currentByteSize,
      maxByteSize: this.maxByteSize,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private evictOne(): void {
    const evicted = this.lru.evictTail();
    if (evicted) {
      this.evictions++;
      this.currentByteSize -= this.calculateEntrySize(evicted.key, evicted.value);
      this.emit('evict', evicted.key);
      this.logger?.debug?.(`Evicted key due to byte size limit: ${evicted.key}`);
    }
  }

  private calculateEntrySize(key: string, value: CacheValue): number {
    let size = key.length * 2; // UTF-16
    size += typeof value.body === 'string' ? value.body.length * 2 : value.body.length;
    size += JSON.stringify(value.headers).length * 2;
    return size;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.lru.entries()) {
        if (value.expiresAt <= now) {
          this.delete(key);
          this.emit('expire', key);
        }
      }
    }, this.cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
