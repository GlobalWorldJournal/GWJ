import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { CATEGORIES, categorySlug } from '@gwj/shared-types'
import { loadEnv, type Env } from './env'
import { connectDb, disconnectDb } from './db'
import { CategoryModel } from './models/Category'
import { UserModel } from './models/User'
import { logger } from './logger'

const BCRYPT_ROUNDS = 12

/** Idempotently upsert the fixed category set. */
export async function seedCategories(): Promise<void> {
  await Promise.all(
    CATEGORIES.map((name, index) =>
      CategoryModel.updateOne(
        { name },
        { $set: { name, slug: categorySlug(name), order: index } },
        { upsert: true },
      ),
    ),
  )
  logger.info('seeded categories', { count: CATEGORIES.length })
}

/** Idempotently upsert the single admin user from env. Re-hashes the password each run. */
export async function seedAdminUser(env: Env): Promise<void> {
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS)
  await UserModel.updateOne(
    { username: env.ADMIN_USERNAME },
    { $set: { username: env.ADMIN_USERNAME, passwordHash, role: 'admin' } },
    { upsert: true },
  )
  logger.info('seeded admin user', { username: env.ADMIN_USERNAME })
}

export async function runSeed(env: Env): Promise<void> {
  await seedCategories()
  await seedAdminUser(env)
}

async function main(): Promise<void> {
  const env = loadEnv()
  await connectDb(env.MONGO_URI)
  try {
    await runSeed(env)
  } finally {
    await disconnectDb()
  }
}

const entry = argv[1] ? fileURLToPath(import.meta.url) === argv[1] : false
if (entry) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('seed failed', { message })
    process.exit(1)
  })
}
