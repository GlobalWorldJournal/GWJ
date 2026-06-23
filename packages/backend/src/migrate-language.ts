/**
 * One-off migration: stamp existing articles (created before the multi-language
 * feature) with language='en' so they show up in the English edition's
 * language-filtered queries. Idempotent. Run as a one-shot ECS task:
 *   bun run src/migrate-language.ts
 */
import { loadEnv } from './env'
import { connectDb, disconnectDb } from './db'
import { ArticleModel } from './models/Article'

const env = loadEnv()
await connectDb(env.MONGO_URI)
const result = await ArticleModel.updateMany(
  { language: { $exists: false } },
  { $set: { language: 'en' } },
)
process.stdout.write(`language backfill: matched ${result.matchedCount}, modified ${result.modifiedCount}\n`)
await disconnectDb()
