export interface ClientCacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface ClientCacheOptions {
  ttlMs?: number;
  storageKeyPrefix?: string;
}

const defaultOptions: Required<ClientCacheOptions> = {
  ttlMs: 60_000,
  storageKeyPrefix: 'cachify:'
};

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export class ClientCache<T = unknown> {
  private mem = new Map<string, ClientCacheEntry<T>>();
  private options: Required<ClientCacheOptions>;

  constructor(options: ClientCacheOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  private getStorageKey(key: string): string {
    return `${this.options.storageKeyPrefix}${key}`;
  }

  set(key: string, value: T, ttlMs = this.options.ttlMs): void {
    const expiresAt = Date.now() + ttlMs;
    const entry: ClientCacheEntry<T> = { expiresAt, value };

    this.mem.set(key, entry);

    if (hasLocalStorage()) {
      try {
        window.localStorage.setItem(this.getStorageKey(key), JSON.stringify(entry));
      } catch {
        // ignore storage errors
      }
    }
  }

  get(key: string): T | undefined {
    const now = Date.now();

    const memEntry = this.mem.get(key);
    if (memEntry) {
      if (memEntry.expiresAt > now) {
        return memEntry.value;
      }
      this.mem.delete(key);
    }

    if (hasLocalStorage()) {
      try {
        const raw = window.localStorage.getItem(this.getStorageKey(key));
        if (!raw) return undefined;
        const entry: ClientCacheEntry<T> = JSON.parse(raw);
        if (entry.expiresAt > now) {
          this.mem.set(key, entry);
          return entry.value;
        }
        window.localStorage.removeItem(this.getStorageKey(key));
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  delete(key: string): void {
    this.mem.delete(key);
    if (hasLocalStorage()) {
      try {
        window.localStorage.removeItem(this.getStorageKey(key));
      } catch {
        // ignore
      }
    }
  }

  clear(): void {
    this.mem.clear();
    if (hasLocalStorage()) {
      try {
        const prefix = this.options.storageKeyPrefix;
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            window.localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
    }
  }
}
