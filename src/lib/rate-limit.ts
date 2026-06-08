import type { NextRequest } from 'next/server';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  max: number;
  windowMs: number;
};

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, RateLimitEntry>;
};

const store = globalForRateLimit.rateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.rateLimitStore = store;

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = request.headers.get('user-agent') || 'unknown-agent';
  return forwardedFor || request.headers.get('x-real-ip') || `direct:${userAgent}`;
}

function getKey(request: NextRequest, action: string) {
  return `${action}:${getClientIp(request)}`;
}

export function checkRateLimit(
  request: NextRequest,
  action: string,
  options: RateLimitOptions
) {
  const now = Date.now();
  const key = getKey(request, action);
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  store.set(key, current);

  const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);

  return {
    allowed: current.count <= options.max,
    retryAfterSeconds,
  };
}

export function resetRateLimit(request: NextRequest, action: string) {
  store.delete(getKey(request, action));
}
