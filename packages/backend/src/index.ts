import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './env'
import { connectDb, disconnectDb } from './db'
import { createApp } from './app'
import { logger } from './logger'

export { createApp } from './app'

async function bootstrap(): Promise<void> {
  const env = loadEnv()
  await connectDb(env.MONGO_URI)
  const app = createApp(env)

  const server = app.listen(env.PORT, () => {
    logger.info('gwj backend listening', { port: env.PORT })
  })

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal })
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0))
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// Only auto-start when executed directly, not when imported (e.g. by tests).
const entry = argv[1] ? fileURLToPath(import.meta.url) === argv[1] : false
if (entry) {
  bootstrap().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('failed to start backend', { message })
    process.exit(1)
  })
}
