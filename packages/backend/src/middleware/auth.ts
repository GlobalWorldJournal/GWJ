import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiScope } from '@gwj/shared-types';
import { authService } from '../services/authService';
import { API_TOKEN_PREFIX, apiTokenService } from '../services/apiTokenService';
import { hasScope, type Principal } from '../auth/principal';
import { ForbiddenError, UnauthorizedError } from '../errors';

const BEARER_PREFIX = 'Bearer ';

function extractBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/** The authenticated caller (set by requireAuth). */
export function principalOf(req: Request): Principal {
  if (!req.principal) throw new UnauthorizedError('Not authenticated');
  return req.principal;
}

/**
 * Require an authenticated caller: an admin's JWT, or an agent's API token
 * (`gwj_…`). Attaches `req.principal`; otherwise forwards a 401.
 */
export function requireAuth(jwtSecret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearer(req.header('authorization'));
    if (!token) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    try {
      if (token.startsWith(API_TOKEN_PREFIX)) {
        const agent = await apiTokenService.authenticate(token);
        if (!agent) throw new UnauthorizedError('Unknown or revoked API token');
        req.principal = agent;
      } else {
        const payload = authService.verify(token, jwtSecret);
        const user = await authService.activeUser(payload.sub);
        if (!user) throw new UnauthorizedError('This account is no longer active');
        req.principal = {
          kind: 'user',
          userId: user.id,
          username: user.username,
          role: user.role,
        };
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Refuse (403) an agent whose token lacks `scope`; admin users always pass. */
export function assertScope(req: Request, scope: ApiScope): void {
  if (!hasScope(principalOf(req), scope)) {
    throw new ForbiddenError(
      `This token is not allowed to ${scope.replace(':', ' ')} (missing scope "${scope}")`,
    );
  }
}

/** Route guard form of {@link assertScope}. */
export function requireScope(scope: ApiScope): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      assertScope(req, scope);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** The calling person (behind requireUser/requireAdmin); an agent is refused. */
export function userPrincipalOf(req: Request): Extract<Principal, { kind: 'user' }> {
  const principal = principalOf(req);
  if (principal.kind !== 'user') throw new ForbiddenError('People only');
  return principal;
}

/** Only people (a newsroom JWT) — never an agent token, whatever its scopes. */
export function requireUser(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next(principalOf(req).kind === 'user' ? undefined : new ForbiddenError('People only'));
  };
}

/** Only admins: running the newsroom (people, agent tokens) is not an editor's job. */
export function requireAdmin(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = principalOf(req);
    next(
      principal.kind === 'user' && principal.role === 'admin'
        ? undefined
        : new ForbiddenError('Admins only'),
    );
  };
}
