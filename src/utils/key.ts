export interface CacheKeyOptions {
  keyGenerator?: (req: { 
    method?: string; 
    url?: string; 
    originalUrl?: string; 
    query?: Record<string, any>; 
    body?: any;
    headers?: Record<string, string | string[] | undefined>;
  }) => string;
}

export const defaultKeyGenerator = (req: { 
  method?: string; 
  url?: string; 
  originalUrl?: string; 
  query?: Record<string, any>;
  headers?: Record<string, string | string[] | undefined>;
}, varyHeaders: string[] = []): string => {
  const method = req.method ?? 'GET';
  const rawUrl = req.originalUrl || req.url || '/';
  
  // Basic sanitization: remove trailing slashes and multiple slashes
  const url = rawUrl.replace(/\/+$/, '').replace(/\/+/g, '/') || '/';

  const queryObj = req.query || {};
  const sortedQuery = Object.keys(queryObj)
    .sort()
    .filter(key => key !== '_') // common cache buster
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(queryObj[key]))}`)
    .join('&');

  let key = `${method}:${url}`;
  if (sortedQuery) {
    key += `?${sortedQuery}`;
  }

  if (varyHeaders.length > 0 && req.headers) {
    const varyValue = varyHeaders
      .sort()
      .map(h => {
        const val = req.headers?.[h.toLowerCase()];
        return `${h}:${Array.isArray(val) ? val.join(',') : val}`;
      })
      .join('|');
    key += `@${varyValue}`;
  }

  return key;
};
