export interface CacheValue {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Buffer;
  createdAt: number;
  expiresAt: number;
  staleAt?: number;
  tags?: string[];
}

export interface CacheStoreOptions {
  defaultTTL?: number;
  cleanupIntervalMs?: number;
  maxItems?: number;
  maxSize?: number; // in bytes
  logger?: {
    info(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
  };
}

export interface ICacheStore {
  get(key: string): CacheValue | undefined;
  set(key: string, value: Omit<CacheValue, 'createdAt' | 'expiresAt'>, ttlSeconds?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  invalidate(keyOrPredicate: string | ((key: string) => boolean)): number;
  invalidateByTag(tag: string): number;
  size(): number;
}
