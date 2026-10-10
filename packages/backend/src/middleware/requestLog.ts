import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';

/** Correlates a request across the ALB, this log and the client (echoed back). */
export const REQUEST_ID_HEADER = 'x-request-id';
/** An upstream id is reused only when it is a plausible token, never arbitrary text. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
/** Polled by the ALB and the deploy check: logging each would drown real traffic. */
const QUIET_PATHS = new Set(['/healthz', '/readyz']);
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

/** The request id assigned by {@link requestLog}, for other middleware to log. */
export function requestIdOf(res: Response): string | undefined {
  const value: unknown = res.locals.requestId;
  return typeof value === 'string' ? value : undefined;
}

/**
 * One structured log line per request (method, path WITHOUT the query string,
 * status, duration, client ip) tagged with a request id that is also returned in
 * the `x-request-id` response header. 5xx responses log at error level.
 */
export function requestLog() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.get(REQUEST_ID_HEADER);
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    const started = process.hrtime.bigint();
    // Captured now: by `finish` a mounted router has rewritten req.url/req.path.
    const path = req.path;

    res.on('finish', () => {
      if (QUIET_PATHS.has(path) && res.statusCode < 500) return;
      const fields = {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / NANOSECONDS_PER_MILLISECOND),
        ip: req.ip,
      };
      if (res.statusCode >= 500) logger.error('request', fields);
      else logger.info('request', fields);
    });
    next();
  };
}
