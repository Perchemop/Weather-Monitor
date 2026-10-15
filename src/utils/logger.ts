import { Request, Response, NextFunction } from 'express';

/**
 * Minimal structured logger.
 *
 * Emits single-line JSON (one object per event) by default, which is trivial to
 * ship to any log aggregator. Set LOG_FORMAT=pretty for human-readable local
 * output, and LOG_LEVEL to control verbosity.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Resolved lazily so that `.env` loaded after module evaluation is honoured.
let cachedLevel: LogLevel | null = null;
function activeLevel(): LogLevel {
  if (cachedLevel) return cachedLevel;
  const configured = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  cachedLevel = LEVEL_WEIGHT[configured] ? configured : 'info';
  return cachedLevel;
}

function prettyMode(): boolean {
  return process.env.LOG_FORMAT === 'pretty';
}

export type LogFields = Record<string, unknown>;

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[activeLevel()]) return;

  const line = prettyMode()
    ? `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}` +
      (fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '')
    : JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...(fields || {}) });

  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
  /** Derives a logger that automatically tags every entry with the given fields. */
  child: (base: LogFields) => ({
    debug: (msg: string, fields?: LogFields) => emit('debug', msg, { ...base, ...fields }),
    info: (msg: string, fields?: LogFields) => emit('info', msg, { ...base, ...fields }),
    warn: (msg: string, fields?: LogFields) => emit('warn', msg, { ...base, ...fields }),
    error: (msg: string, fields?: LogFields) => emit('error', msg, { ...base, ...fields })
  })
};

/** Logs one structured line per HTTP request with method, path, status and latency. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Health probes and static assets are noisy; log them at debug level.
    const isNoise = req.path === '/healthz' || req.path.startsWith('/assets/');
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    emit(isNoise ? 'debug' : level, 'http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10
    });
  });
  next();
}
