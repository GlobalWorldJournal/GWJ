import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import type {
  ChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
  User,
} from '@gwj/shared-types';
import { hashPassword, verifyPassword } from './password';
import { getDb } from '../db/client';
import { isRecordId, newRecordId } from '../db/ids';
import { isUniqueViolation } from '../db/pgErrors';
import { users, type UserRow } from '../db/schema/users';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

async function findUser(id: string): Promise<UserRow> {
  const [row] = isRecordId(id) ? await getDb().select().from(users).where(eq(users.id, id)) : [];
  if (!row) throw new NotFoundError('User not found');
  return row;
}

/** Active admins other than `exceptId` — the newsroom must always keep one. */
async function otherActiveAdmins(exceptId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, exceptId)));
  return row?.n ?? 0;
}

export const userService = {
  async list(): Promise<User[]> {
    const rows = await getDb().select().from(users).orderBy(asc(users.username));
    return rows.map(toUser);
  },

  async create(input: CreateUserInput): Promise<User> {
    try {
      const [row] = await getDb()
        .insert(users)
        .values({
          id: newRecordId(),
          username: input.username,
          passwordHash: await hashPassword(input.password),
          role: input.role,
        })
        .returning();
      if (!row) throw new Error('user insert returned no row');
      return toUser(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('That username is taken');
      throw err;
    }
  },

  /**
   * An admin changes someone's role or (de)activates them. Nobody demotes or
   * deactivates themselves, and the last active admin cannot be removed: the
   * newsroom would be left with no one able to run it.
   */
  async update(id: string, input: UpdateUserInput, actingUserId: string): Promise<User> {
    const user = await findUser(id);
    const losesAdmin =
      user.role === 'admin' &&
      !user.disabledAt &&
      ((input.role !== undefined && input.role !== 'admin') || input.disabled === true);
    if (losesAdmin && id === actingUserId) {
      throw new BadRequestError('You cannot remove your own admin access');
    }
    if (losesAdmin && (await otherActiveAdmins(id)) === 0) {
      throw new BadRequestError('The newsroom must keep at least one active admin');
    }
    const [row] = await getDb()
      .update(users)
      .set({
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.disabled !== undefined
          ? { disabledAt: input.disabled ? (user.disabledAt ?? new Date()) : null }
          : {}),
      })
      .where(eq(users.id, id))
      .returning();
    if (!row) throw new NotFoundError('User not found');
    return toUser(row);
  },

  /** A person changes their own password, proving they know the current one. */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await findUser(userId);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      // 400, not 401: the session itself is valid and must not be ended.
      throw new BadRequestError('The current password is wrong');
    }
    await getDb()
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword) })
      .where(eq(users.id, userId));
  },
};
