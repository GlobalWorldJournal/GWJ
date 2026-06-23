import type { AuthTokenPayload } from '../services/authService'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      auth?: AuthTokenPayload
      validatedQuery?: unknown
    }
  }
}

export {}
