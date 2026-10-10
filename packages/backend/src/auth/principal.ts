import type { ApiScope } from '@gwj/shared-types';

/** Who is calling the admin API: a person (admin JWT) or an agent (API token). */
export type Principal =
  | { kind: 'user'; userId: string; username: string }
  | { kind: 'agent'; tokenId: string; name: string; scopes: readonly ApiScope[] };

/** Admin users may do everything; an agent only what its token's scopes allow. */
export function hasScope(principal: Principal, scope: ApiScope): boolean {
  return principal.kind === 'user' || principal.scopes.includes(scope);
}

/** How the principal appears in an article's history. */
export function actorName(principal: Principal): string {
  return principal.kind === 'user' ? principal.username : `agent:${principal.name}`;
}
