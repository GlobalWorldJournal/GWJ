import type { Principal } from '../auth/principal';
import type { AdvertiserRow } from '../db/schema/advertisers';

declare global {
  namespace Express {
    interface Request {
      /** The authenticated caller, set by requireAuth. */
      principal?: Principal;
      validatedQuery?: unknown;
      /** The signed-in advertiser, set by requireAdvertiser. */
      advertiser?: AdvertiserRow;
    }
  }
}
