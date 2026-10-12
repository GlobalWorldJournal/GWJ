import Stripe from 'stripe';
import { BadGatewayError } from '../errors';
import { errorFields, logger } from '../logger';

/** What we hand Stripe to start a one-off payment. */
export interface CheckoutSessionRequest {
  campaignId: string;
  amountCents: number;
  currency: string;
  productName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds; Stripe requires 30 minutes to 24 hours from now. */
  expiresAtSeconds: number;
  locale: 'en' | 'es' | 'fr';
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

/** The only webhook events the booking flow acts on, reduced to what it needs. */
export type PaymentEvent =
  | {
      type: 'checkout.session.completed';
      sessionId: string;
      paid: boolean;
      paymentIntentId: string | null;
    }
  | { type: 'checkout.session.expired'; sessionId: string };

/** The webhook body failed signature verification. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * The payment processor, behind a seam so the booking logic is tested without the
 * network. The real implementation is {@link createStripeGateway}.
 */
export interface StripeGateway {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession>;
  /** Refund a payment in full. `idempotencyKey` makes a retry return the first refund. */
  refundPaymentIntent(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  /**
   * Verify `rawBody` against the `Stripe-Signature` header and return the event we
   * act on, or null for any other event type. Throws {@link WebhookSignatureError}.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent | null>;
}

function idOf(value: string | { id: string } | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : value.id;
}

export function createStripeGateway(secretKey: string, webhookSecret: string): StripeGateway {
  const stripe = new Stripe(secretKey);
  return {
    async createCheckoutSession(request) {
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          client_reference_id: request.campaignId,
          customer_email: request.customerEmail,
          locale: request.locale,
          expires_at: request.expiresAtSeconds,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          metadata: { campaignId: request.campaignId },
          payment_intent_data: { metadata: { campaignId: request.campaignId } },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: request.currency,
                unit_amount: request.amountCents,
                product_data: { name: request.productName },
              },
            },
          ],
        });
        if (!session.url) throw new Error('Stripe returned a Checkout session without a URL');
        return { sessionId: session.id, url: session.url };
      } catch (err) {
        logger.error('stripe checkout session failed', errorFields(err));
        throw new BadGatewayError('The payment provider is unavailable; please try again');
      }
    },

    async refundPaymentIntent(paymentIntentId, idempotencyKey) {
      await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey });
    },

    async constructWebhookEvent(rawBody, signature) {
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      } catch (err) {
        throw new WebhookSignatureError(err instanceof Error ? err.message : 'Invalid signature');
      }
      // A delayed method (bank debit) completes unpaid first and settles later with
      // `async_payment_succeeded`; both land in the same handler.
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object;
        return {
          type: 'checkout.session.completed',
          sessionId: session.id,
          paid: session.payment_status === 'paid',
          paymentIntentId: idOf(session.payment_intent),
        };
      }
      if (event.type === 'checkout.session.expired') {
        return { type: event.type, sessionId: event.data.object.id };
      }
      return null;
    },
  };
}
