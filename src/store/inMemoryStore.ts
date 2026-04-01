export interface CacheValue {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Buffer;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStoreOptions {
  defaultTTL?: number;
  cleanupIntervalMs?: number;
}

export class InMemoryStore {
  private map = new Map<string, CacheValue>();
  private defaultTTL: number;
  private cleanupIntervalMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: CacheStoreOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 60;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 30_000;
    this.startCleanup();
  }

  get(key: string): CacheValue | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: Omit<CacheValue, 'createdAt' | 'expiresAt'>, ttlSeconds?: number): void {
    const now = Date.now();
    const ttl = ttlSeconds ?? this.defaultTTL;
    const expiresAt = now + ttl * 1000;
    this.map.set(key, {
      ...value,
      createdAt: now,
      expiresAt
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  invalidate(keyOrPredicate: string | ((key: string) => boolean)): number {
    let deleted = 0;
    if (typeof keyOrPredicate === 'string') {
      if (this.map.delete(keyOrPredicate)) deleted = 1;
      return deleted;
    }

    for (const key of Array.from(this.map.keys())) {
      if (keyOrPredicate(key)) {
        this.map.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }

  size(): number {
    return this.map.size;
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.map.entries()) {
        if (value.expiresAt <= now) {
          this.map.delete(key);
        }
      }
    }, this.cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
