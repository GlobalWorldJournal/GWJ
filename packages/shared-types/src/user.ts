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
