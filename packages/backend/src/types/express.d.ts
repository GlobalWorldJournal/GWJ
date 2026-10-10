import type { AuthTokenPayload } from '../services/authService';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      auth?: AuthTokenPayload;
      validatedQuery?: unknown;
    }
  }
}

export {};
