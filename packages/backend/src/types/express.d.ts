import type { Principal } from '../auth/principal';

declare global {
  namespace Express {
    interface Request {
      /** The authenticated caller, set by requireAuth. */
      principal?: Principal;
      validatedQuery?: unknown;
    }
  }
}
