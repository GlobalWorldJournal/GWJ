import { ROLE_SCOPES, type ApiScope, type UserRole } from '@gwj/shared-types';

/** Who is calling the admin API: a person (newsroom JWT) or an agent (API token). */
export type Principal =
  | { kind: 'user'; userId: string; username: string; role: UserRole }
  | { kind: 'agent'; tokenId: string; name: string; scopes: readonly ApiScope[] };

/** A person may do what their role allows; an agent what its token's scopes allow. */
export function hasScope(principal: Principal, scope: ApiScope): boolean {
  const scopes = principal.kind === 'user' ? ROLE_SCOPES[principal.role] : principal.scopes;
  return scopes.includes(scope);
}

/** How the principal appears in an article's history. */
export function actorName(principal: Principal): string {
  return principal.kind === 'user' ? principal.username : `agent:${principal.name}`;
}
