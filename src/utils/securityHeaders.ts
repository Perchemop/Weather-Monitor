import { Request, Response, NextFunction } from 'express';

/**
 * Baseline security headers for the local-first monitoring enclave.
 *
 * We set these explicitly rather than depending on `helmet` to keep the
 * dependency surface minimal and auditable. The application renders a Vite /
 * React SPA that talks to same-origin `/api` endpoints and loads Google Fonts,
 * so the CSP is deliberately scoped to those origins instead of `unsafe-*`.
 */

export interface SecurityHeaderOptions {
  /** When true, emit HSTS. Enable only when the app is served over HTTPS. */
  enableHsts?: boolean;
  /**
   * When true, relaxes the CSP for the Vite dev server (inline React Refresh
   * preamble and the HMR websocket). Never enable this in production.
   */
  dev?: boolean;
}

function buildCsp(dev: boolean): string {
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const connectSrc = dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
  const styleSrc = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    // Vite injects inline style tags; scripts remain restricted to self.
    styleSrc,
    "font-src 'self' https://fonts.gstatic.com data:",
    scriptSrc,
    connectSrc,
    "form-action 'self'"
  ].join('; ');
}

export function securityHeaders(options: SecurityHeaderOptions = {}) {
  const { enableHsts = false, dev = false } = options;
  const csp = buildCsp(dev);

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    res.removeHeader('X-Powered-By');

    if (enableHsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}
