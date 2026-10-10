import { z } from 'zod';

/**
 * A newsroom member's role. `admin` runs the newsroom (people, agent tokens,
 * deleting stories); `editor` writes, edits and publishes.
 */
export const UserRoleSchema = z.enum(['admin', 'editor']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Public-safe user shape (never includes passwordHash). */
export const UserSchema = z.object({
  id: z.string(),
  username: z.string().min(1),
  role: UserRoleSchema,
  createdAt: z.string().datetime(),
  /** Set when the account was deactivated: it can no longer sign in. */
  disabledAt: z.string().datetime().nullable(),
});
export type User = z.infer<typeof UserSchema>;

/** Passwords: long enough to resist guessing; bcrypt reads at most 72 bytes. */
const PasswordSchema = z.string().min(12, 'at least 12 characters').max(72);

export const CreateUserInputSchema = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'lowercase letters, digits, and . _ - between them')
    .max(40),
  password: PasswordSchema,
  role: UserRoleSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

/** An admin changing someone's role, or (de)activating them. */
export const UpdateUserInputSchema = z
  .object({ role: UserRoleSchema.optional(), disabled: z.boolean().optional() })
  .refine((input) => input.role !== undefined || input.disabled !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

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

/** What each newsroom role may do (people; an agent has its token's scopes). */
export const ROLE_SCOPES: Record<UserRole, readonly ApiScope[]> = {
  admin: API_SCOPES,
  editor: ['articles:write', 'articles:publish', 'media:upload', 'takedowns'],
};

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
