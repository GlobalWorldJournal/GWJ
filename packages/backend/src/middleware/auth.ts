import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { authService } from '../services/authService';
import { UnauthorizedError } from '../errors';

const BEARER_PREFIX = 'Bearer ';

function extractBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Build middleware that requires a valid admin JWT. On success it attaches
 * `req.userId` and `req.auth`; otherwise it forwards a 401 to the error handler.
 */
export function requireAuth(jwtSecret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractBearer(req.header('authorization'));
    if (!token) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    try {
      const payload = authService.verify(token, jwtSecret);
      req.userId = payload.sub;
      req.auth = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}
