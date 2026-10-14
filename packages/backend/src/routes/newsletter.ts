import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  NewsletterSubscribeInputSchema,
  NewsletterTokenInputSchema,
  type NewsletterConfirmResponse,
  type NewsletterSubscribeInput,
  type NewsletterSubscribeResponse,
  type NewsletterTokenInput,
} from '@gwj/shared-types';
import { validate } from '../middleware/validate';
import type { NewsletterService } from '../services/newsletterService';

const RATE_WINDOW_MS = 15 * 60 * 1000;
/** Sign-ups per IP per window: each one can send an email. */
const SUBSCRIBE_MAX = 10;
const LINK_MAX = 60;

function limiter(max: number): RequestHandler {
  return rateLimit({
    windowMs: RATE_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * The public newsletter API: `/api/newsletter`. The signed token of a link comes in
 * the body (the reader's page) or in the query string (a mail client's one-click
 * unsubscribe POST, RFC 8058, whose body is a form and not ours to parse).
 */
export function createNewsletterRouter(service: NewsletterService): Router {
  const router = Router();

  router.post(
    '/subscribe',
    limiter(SUBSCRIBE_MAX),
    validate(NewsletterSubscribeInputSchema),
    async (req, res, next) => {
      try {
        const input: NewsletterSubscribeInput = req.body;
        await service.subscribe(input);
        const body: NewsletterSubscribeResponse = { status: 'pending_confirmation' };
        res.status(202).json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/confirm',
    limiter(LINK_MAX),
    validate(NewsletterTokenInputSchema),
    async (req, res, next) => {
      try {
        const { token }: NewsletterTokenInput = req.body;
        const { language } = await service.confirm(token);
        const body: NewsletterConfirmResponse = { status: 'confirmed', language };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/unsubscribe', limiter(LINK_MAX), async (req, res, next) => {
    try {
      const fromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
      const parsed = NewsletterTokenInputSchema.safeParse({ token: fromQuery ?? req.body?.token });
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
        return;
      }
      const { language } = await service.unsubscribe(parsed.data.token);
      const body: NewsletterConfirmResponse = { status: 'unsubscribed', language };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
