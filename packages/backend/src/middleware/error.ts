import { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../errors'
import { logger } from '../logger'

interface MongoDuplicateError {
  code: number
  keyValue?: Record<string, unknown>
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  )
}

const INTERNAL_ERROR = 'Internal server error'

/** 404 handler for unmatched routes. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not found' })
}

/**
 * Central error handler. Maps known error shapes (HttpError, ZodError, Mongo
 * duplicate key) to structured `{ error, details? }` responses and treats
 * anything else as a 500. The stack is never leaked outside development.
 */
export function createErrorHandler(isDev: boolean): ErrorRequestHandler {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details })
      return
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.flatten() })
      return
    }
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: 'Duplicate key', details: err.keyValue })
      return
    }

    const message = err instanceof Error ? err.message : String(err)
    logger.error('unhandled error', { message })
    res.status(500).json({
      error: INTERNAL_ERROR,
      ...(isDev && err instanceof Error ? { details: err.stack } : {}),
    })
  }
}
