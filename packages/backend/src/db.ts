import mongoose from 'mongoose'
import { logger } from './logger'

/** Connect mongoose to the given URI. Idempotent: returns early if already connected. */
export async function connectDb(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return
  await mongoose.connect(uri)
  logger.info('mongodb connected', { host: mongoose.connection.host })
}

/** Disconnect mongoose. Safe to call when not connected. */
export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) return
  await mongoose.disconnect()
  logger.info('mongodb disconnected')
}
