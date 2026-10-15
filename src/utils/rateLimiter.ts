import { Request, Response, NextFunction } from 'express';

/**
 * Minimal dependency-free in-memory rate limiter.
 *
 * The Construction Weather Monitor is a local-first, single-user enclave, so a
 * lightweight fixed-window limiter is sufficient to blunt brute-force login
 * attempts and runaway client loops without pulling in an external store.
 */

export interface RateLimiterOptions {
  /** Length of the window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests permitted per key within the window. */
  max: number;
  /** Optional custom key derivation. Defaults to the client IP address. */
  keyGenerator?: (req: Request) => string;
  /** Optional message returned with HTTP 429 responses. */
  message?: string;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  /** Clears all tracked windows. Intended for tests. */
  reset: () => void;
}

/**
 * Resolves the best-effort client identity for rate limiting. Express sets
 * `req.ip`; we fall back to the socket address when it is unavailable.
 */
export function defaultKeyGenerator(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Applies standard security headers to every response. */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max, keyGenerator = defaultKeyGenerator, message } = options;
  const windows = new Map<string, WindowState>();

  // Opportunistically evict expired windows so the map cannot grow unbounded.
  const sweep = () => {
    const now = Date.now();
    for (const [key, state] of windows) {
      if (state.resetAt <= now) windows.delete(key);
    }
  };

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (windows.size > 5000) sweep();

    const key = keyGenerator(req);
    let state = windows.get(key);

    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      windows.set(key, state);
    }

    state.count += 1;
    const remaining = Math.max(0, max - state.count);
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfterSec));

    if (state.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: message || 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: retryAfterSec
      });
      return;
    }

    return next();
  }) as RateLimiter;

  middleware.reset = () => windows.clear();
  return middleware;
}
