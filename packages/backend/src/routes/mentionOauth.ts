import { Router, type Request, type Response } from 'express';
import type { Env } from '../env';
import { completeAuthorization } from '../channels/mentionOauthService';
import { errorFields, logger } from '../logger';

/**
 * Mention's own redirect lands here straight from the admin's browser after
 * they approve as @gwj — it carries no admin session of ours (a plain
 * cross-site GET from Mention's domain), so this is NOT mounted on the
 * `/api/admin` router and does not require our own auth. Its real security
 * control is `state`: a value only `beginAuthorization` could have minted
 * (sealed with the same key the database rows are sealed with), echoed back
 * verbatim by Mention's authorization server — exactly the standard OAuth
 * reasoning for `state`, just also carrying the PKCE verifier and client
 * details this stateless callback needs to finish the exchange.
 */
export function createMentionOauthRouter(env: Env): Router {
  const router = Router();

  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (typeof error === 'string') {
      res.status(400).send(`Mention authorization refused: ${error} ${errorDescription ?? ''}`);
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).send('Missing code or state.');
      return;
    }
    try {
      await completeAuthorization(env, code, state);
      res.send('GWJ is now connected to Mention as @gwj. You can close this tab.');
    } catch (err) {
      logger.error('mention: authorization callback failed', errorFields(err));
      res.status(400).send(`Could not complete Mention authorization: ${(err as Error).message}`);
    }
  });

  return router;
}
