import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Public-safe user shape (never includes passwordHash). */
export const UserSchema = z.object({
  id: z.string(),
  username: z.string().min(1),
  role: UserRoleSchema,
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * What an API token (an agent's credential) may do. Reading is always allowed;
 * each kind of change needs its scope. Admin users (JWT) hold all of them.
 */
export const API_SCOPES = [
  'articles:write',
  'articles:publish',
  'articles:delete',
  'media:upload',
  'takedowns',
] as const;
export const ApiScopeSchema = z.enum(API_SCOPES);
export type ApiScope = z.infer<typeof ApiScopeSchema>;

/** An API token as listed to admins (never the secret itself). */
export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(ApiScopeSchema),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const CreateApiTokenInputSchema = z.object({
  /** Who uses it, e.g. "newsroom-agent"; shown in the article history as agent:<name>. */
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single dashes only')
    .max(40),
  scopes: z.array(ApiScopeSchema).min(1),
});
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInputSchema>;

/** The response to creating a token: the secret, shown this once and never again. */
export const CreatedApiTokenSchema = ApiTokenSchema.extend({ token: z.string() });
export type CreatedApiToken = z.infer<typeof CreatedApiTokenSchema>;
