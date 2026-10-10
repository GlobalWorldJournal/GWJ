import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { UserRoleSchema, type UserRole } from '@gwj/shared-types'
import { RECORD_ID_SQL_PATTERN } from '../ids'
import { sqlInList } from '../sqlLiterals'

/** CMS admin accounts. `id` keeps the ObjectId shape: it is the JWT `sub`. */
export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    username: text().notNull(),
    /** bcrypt hash, copied verbatim from Mongo. Never serialized. */
    passwordHash: text().notNull(),
    role: text().$type<UserRole>().notNull().default('admin'),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('users_username_unique').on(t.username),
    check('users_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check('users_role_check', sql`${t.role} IN ${sqlInList(UserRoleSchema.options)}`),
  ],
)

export type UserRow = typeof users.$inferSelect
