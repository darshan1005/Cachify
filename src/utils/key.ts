export interface CacheKeyOptions {
  keyGenerator?: (req: { method?: string; url?: string; originalUrl?: string; query?: Record<string, any>; body?: any }) => string;
}

export const defaultKeyGenerator = (req: { method?: string; url?: string; originalUrl?: string; query?: Record<string, any> }): string => {
  const method = req.method ?? 'GET';
  const url = req.originalUrl || req.url || '/';

  const queryObj = req.query || {};
  const sortedQuery = Object.keys(queryObj)
    .sort()
    .map((key) => `${key}=${queryObj[key]}`)
    .join('&');

  if (sortedQuery) {
    return `${method}:${url}?${sortedQuery}`;
  }

  return `${method}:${url}`;
};
