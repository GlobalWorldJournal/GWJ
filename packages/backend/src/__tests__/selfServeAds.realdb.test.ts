import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import request from 'supertest';
import type { Express } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import {
  AD_CURRENCY,
  AD_DAILY_RATE_CENTS,
  AD_HOLD_MINUTES,
  AD_MAX_ADVANCE_DAYS,
  AD_MAX_DAYS,
  type AdVariant,
  type AdvertiserRegisterInput,
} from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../env';
import { createApp } from '../app';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import { adCampaigns } from '../db/schema/adCampaigns';
import { advertisers } from '../db/schema/advertisers';
import { users } from '../db/schema/users';
import { adCampaignService } from '../services/adCampaignService';
import { advertiserService } from '../services/advertiserService';
import { hashPassword } from '../services/password';
import {
  WebhookSignatureError,
  createStripeGateway,
  type CheckoutSessionRequest,
  type PaymentEvent,
  type StripeGateway,
} from '../services/stripeGateway';
import type { UploadService } from '../services/uploadService';
import { useTestDatabase, type TestDatabase } from '../test/postgres';
import { validPngBuffer } from './imageFixtures';

let testDb: TestDatabase;
let app: Express;
let unconfiguredApp: Express;

const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_USERNAME = 'nate';
const ADMIN_PASSWORD = 'super-secret-pw';
const PASSWORD = 'correct-horse-battery';
const CDN = 'https://cdn.example.test';
const SITE = 'https://site.example.test';
const JWT_SECRET = 'test-jwt-secret';
const VALID_SIGNATURE = 'valid-signature';

/** The one allowed fake: Stripe is an external paid API. */
class FakeGateway implements StripeGateway {
  sessions: CheckoutSessionRequest[] = [];
  refunds: { paymentIntentId: string; key: string }[] = [];
  failCreate = false;
  failRefund = false;
  private counter = 0;

  async createCheckoutSession(request: CheckoutSessionRequest) {
    if (this.failCreate) throw new Error('stripe down');
    this.sessions.push(request);
    this.counter += 1;
    return {
      sessionId: `cs_test_${this.counter}_${request.campaignId}`,
      url: `https://checkout.stripe.test/pay/${this.counter}`,
    };
  }

  async refundPaymentIntent(paymentIntentId: string, key: string) {
    if (this.failRefund) throw new Error('refund failed');
    this.refunds.push({ paymentIntentId, key });
  }

  async constructWebhookEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent | null> {
    if (signature !== VALID_SIGNATURE) throw new WebhookSignatureError('bad signature');
    return JSON.parse(rawBody.toString('utf8')) as PaymentEvent;
  }
}

const gateway = new FakeGateway();

const fakeUploadService: UploadService = {
  async uploadImage(_buffer, filename) {
    return { url: `${CDN}/articles/${filename}`, variants: [] };
  },
  async storeImage(_buffer, filename, _contentType, keyPrefix) {
    return { url: `${CDN}/${keyPrefix}${filename}`, variants: [] };
  },
  async addRenditions() {
    return null;
  },
};

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_USERNAME = ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.AWS_REGION = 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  process.env.PUBLIC_SITE_URL = SITE;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = CDN;
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com';
  resetEnvCache();
  return loadEnv();
}

/** YYYY-MM-DD, `offset` days from today (UTC). */
function day(offset: number): string {
  const today = new Date();
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return new Date(midnight + offset * DAY_MS).toISOString().slice(0, 10);
}

beforeAll(async () => {
  testDb = await useTestDatabase();
  const env = setTestEnv();
  app = createApp(env, { uploadService: fakeUploadService, stripeGateway: gateway });
  unconfiguredApp = createApp(env, { uploadService: fakeUploadService });
});

beforeEach(async () => {
  await testDb.truncateAll();
  gateway.sessions = [];
  gateway.refunds = [];
  gateway.failCreate = false;
  gateway.failRefund = false;
});

afterAll(async () => {
  await testDb.drop();
});

interface Account {
  token: string;
  id: string;
  email: string;
}

let accountCounter = 0;
async function register(overrides: Record<string, unknown> = {}): Promise<Account> {
  accountCounter += 1;
  const email = `buyer${accountCounter}@acme.example`;
  // Straight through the service: the HTTP sign-up is rate limited per IP, and the
  // sign-up route itself is covered by its own tests.
  const result = await advertiserService.register(
    {
      email,
      password: PASSWORD,
      companyName: `Acme ${accountCounter}`,
      acceptTerms: true,
      ...overrides,
    } as AdvertiserRegisterInput,
    JWT_SECRET,
  );
  return { token: result.token, id: result.advertiser.id, email: result.advertiser.email };
}

const auth = (account: Account) => ({ authorization: `Bearer ${account.token}` });

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    variant: 'leaderboard',
    startDate: day(3),
    endDate: day(5),
    imageUrl: `${CDN}/articles/acme.png`,
    clickUrl: 'https://acme.example/?utm=gwj',
    adName: 'Acme coffee',
    acceptTerms: true,
    language: 'en',
    ...overrides,
  };
}

async function book(account: Account, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/advertiser/bookings')
    .set(auth(account))
    .send(bookingBody(overrides));
}

async function webhook(event: Record<string, unknown>, signature = VALID_SIGNATURE) {
  return request(app)
    .post('/api/stripe/webhook')
    .set('stripe-signature', signature)
    .set('content-type', 'application/json')
    .send(JSON.stringify(event));
}

async function rowOf(id: string) {
  const [row] = await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, id));
  if (!row) throw new Error('campaign row missing');
  return row;
}

async function sessionIdOf(id: string): Promise<string> {
  const sessionId = (await rowOf(id)).stripeSessionId;
  if (!sessionId) throw new Error('no stripe session stored');
  return sessionId;
}

function paid(sessionId: string, paymentIntentId = 'pi_test_1') {
  return { type: 'checkout.session.completed', sessionId, paid: true, paymentIntentId };
}

describe('advertiser accounts', () => {
  it('registers, lowercases the email, and signs in', async () => {
    const res = await request(app).post('/api/advertiser/register').send({
      email: 'Boss@Acme.Example',
      password: PASSWORD,
      companyName: 'Acme',
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.advertiser).toMatchObject({ email: 'boss@acme.example', companyName: 'Acme' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const login = await request(app)
      .post('/api/advertiser/login')
      .send({ email: 'BOSS@acme.example', password: PASSWORD });
    expect(login.status).toBe(200);
    const me = await request(app)
      .get('/api/advertiser/me')
      .set({ authorization: `Bearer ${login.body.token as string}` });
    expect(me.body.email).toBe('boss@acme.example');
  });

  it('stores the terms version and acceptance time', async () => {
    const account = await register();
    const [row] = await getDb().select().from(advertisers).where(eq(advertisers.id, account.id));
    expect(row?.termsVersion).toBeTruthy();
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('refuses a registration that has not accepted the terms', async () => {
    for (const acceptTerms of [false, undefined]) {
      const res = await request(app)
        .post('/api/advertiser/register')
        .send({ email: 'a@b.example', password: PASSWORD, companyName: 'X', acceptTerms });
      expect(res.status).toBe(400);
    }
  });

  it('answers a duplicate email with a neutral 409', async () => {
    const first = await register({ email: 'dup@acme.example' });
    expect(first.id).toBeTruthy();
    const res = await request(app)
      .post('/api/advertiser/register')
      .send({ email: 'DUP@acme.example', password: PASSWORD, companyName: 'X', acceptTerms: true });
    expect(res.status).toBe(409);
    expect(res.body.error).not.toMatch(/already (registered|exists|in use)/i);
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const account = await register();
    const wrong = await request(app)
      .post('/api/advertiser/login')
      .send({ email: account.email, password: 'wrong-password-123' });
    const unknown = await request(app)
      .post('/api/advertiser/login')
      .send({ email: 'nobody@acme.example', password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('requires a token for the advertiser API and refuses a forged one', async () => {
    expect((await request(app).get('/api/advertiser/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/advertiser/me').set({ authorization: 'Bearer nope' })).status,
    ).toBe(401);
  });

  it('an advertiser token can never use the admin API, nor an admin token the advertiser API', async () => {
    const account = await register();
    expect((await request(app).get('/api/admin/ad-campaigns').set(auth(account))).status).toBe(401);
    expect((await request(app).get('/api/admin/articles').set(auth(account))).status).toBe(401);

    await getDb()
      .insert(users)
      .values({
        id: newRecordId(),
        username: ADMIN_USERNAME,
        passwordHash: await hashPassword(ADMIN_PASSWORD, 10),
        role: 'admin',
      });
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    const adminToken = { authorization: `Bearer ${adminLogin.body.token as string}` };
    expect((await request(app).get('/api/advertiser/me').set(adminToken)).status).toBe(401);
  });
});

describe('quote and availability', () => {
  it('prices days x the slot rate, end date inclusive', async () => {
    for (const variant of ['leaderboard', 'mrec', 'inline'] as AdVariant[]) {
      const res = await request(app)
        .get('/api/ads/quote')
        .query({ variant, startDate: day(1), endDate: day(4) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        variant,
        days: 4,
        dailyRateCents: AD_DAILY_RATE_CENTS[variant],
        totalCents: AD_DAILY_RATE_CENTS[variant] * 4,
        currency: AD_CURRENCY,
      });
    }
    const single = await request(app)
      .get('/api/ads/quote')
      .query({ variant: 'mrec', startDate: day(1), endDate: day(1) });
    expect(single.body.days).toBe(1);
  });

  it('validates the window', async () => {
    const quote = (startDate: string, endDate: string) =>
      request(app).get('/api/ads/quote').query({ variant: 'mrec', startDate, endDate });
    expect((await quote(day(-1), day(2))).status).toBe(400);
    expect((await quote(day(5), day(4))).status).toBe(400);
    expect((await quote(day(1), day(AD_MAX_DAYS + 1))).status).toBe(400);
    expect((await quote(day(1), day(AD_MAX_DAYS))).status).toBe(200);
    expect((await quote(day(AD_MAX_ADVANCE_DAYS + 1), day(AD_MAX_ADVANCE_DAYS + 2))).status).toBe(
      400,
    );
    expect((await quote(day(AD_MAX_ADVANCE_DAYS), day(AD_MAX_ADVANCE_DAYS + 1))).status).toBe(200);
    expect((await quote('2026-02-31', '2026-03-02')).status).toBe(400);
    expect((await quote('soon', 'later')).status).toBe(400);
    expect((await quote(day(0), day(0))).status).toBe(200);
  });

  it('lists taken days per slot, counting admin campaigns and live holds, not lapsed ones', async () => {
    const account = await register();
    expect((await book(account, { startDate: day(3), endDate: day(4) })).status).toBe(201);
    // An admin campaign (no advertiser) covering day 8 only.
    await adCampaignService.create({
      advertiserName: 'Direct',
      advertiserEmail: 'direct@example.test',
      imageUrl: `${CDN}/x.png`,
      clickUrl: 'https://direct.example',
      variant: 'leaderboard',
      startsAt: `${day(8)}T00:00:00.000Z`,
      endsAt: `${day(9)}T00:00:00.000Z`,
      status: 'active',
    });
    // A lapsed hold must not count.
    const other = await register();
    const lapsed = await book(other, { variant: 'mrec', startDate: day(3), endDate: day(3) });
    await getDb()
      .update(adCampaigns)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(adCampaigns.id, lapsed.body.campaignId as string));

    const res = await request(app)
      .get('/api/ads/availability')
      .query({ variant: 'leaderboard', from: day(0), to: day(10) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ variant: 'leaderboard', bookedDays: [day(3), day(4), day(8)] });
    expect(res.headers['cache-control']).toMatch(/max-age=(\d|1\d|2\d)(?!\d)/);

    const mrec = await request(app)
      .get('/api/ads/availability')
      .query({ variant: 'mrec', from: day(0), to: day(10) });
    expect(mrec.body.bookedDays).toEqual([]);
  });

  it('rejects a reversed or huge range', async () => {
    const get = (from: string, to: string) =>
      request(app).get('/api/ads/availability').query({ variant: 'mrec', from, to });
    expect((await get(day(5), day(1))).status).toBe(400);
    expect((await get(day(0), day(1000))).status).toBe(400);
  });
});

describe('reserving a slot', () => {
  it('holds the slot as pending and returns the Stripe Checkout link', async () => {
    const account = await register();
    const res = await book(account);
    expect(res.status).toBe(201);
    const expectedTotal = AD_DAILY_RATE_CENTS.leaderboard * 3;
    expect(res.body).toMatchObject({ totalCents: expectedTotal });
    expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const holdMs = Date.parse(res.body.holdExpiresAt as string) - Date.now();
    expect(Math.abs(holdMs - AD_HOLD_MINUTES * 60_000)).toBeLessThan(10_000);

    const row = await rowOf(res.body.campaignId as string);
    expect(row).toMatchObject({
      status: 'pending',
      advertiserId: account.id,
      amountCents: expectedTotal,
      adName: 'Acme coffee',
      variant: 'leaderboard',
    });
    expect(row.startsAt.toISOString()).toBe(`${day(3)}T00:00:00.000Z`);
    expect(row.endsAt.toISOString()).toBe(`${day(6)}T00:00:00.000Z`);
    expect(row.stripeSessionId).toBeTruthy();

    const session = gateway.sessions[0];
    expect(session).toMatchObject({
      campaignId: res.body.campaignId,
      amountCents: expectedTotal,
      currency: AD_CURRENCY,
      customerEmail: account.email,
      successUrl: `${SITE}/advertise/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${SITE}/advertise/dashboard`,
    });
    const sessionLifeSeconds = (session?.expiresAtSeconds ?? 0) - Date.now() / 1000;
    expect(sessionLifeSeconds).toBeGreaterThan(30 * 60);
    expect(sessionLifeSeconds).toBeLessThan(AD_HOLD_MINUTES * 60);
  });

  it('uses the language prefix in the return URLs', async () => {
    const account = await register();
    await book(account, { language: 'es' });
    await book(account, { language: 'fr', startDate: day(20), endDate: day(20) });
    expect(gateway.sessions[0]?.successUrl).toBe(
      `${SITE}/es/advertise/success?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(gateway.sessions[1]?.cancelUrl).toBe(`${SITE}/fr/advertise/dashboard`);
  });

  it('does not serve a pending (unpaid) booking', async () => {
    const account = await register();
    await book(account, { startDate: day(0), endDate: day(1) });
    expect(await adCampaignService.findActive('leaderboard')).toBeNull();
  });

  it('refuses overlapping dates on the same slot with 409, but not other slots or free dates', async () => {
    const a = await register();
    const b = await register();
    expect((await book(a, { startDate: day(3), endDate: day(5) })).status).toBe(201);
    const clash = await book(b, { startDate: day(5), endDate: day(7) });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('Those dates were just taken');
    expect((await book(b, { startDate: day(3), endDate: day(5), variant: 'mrec' })).status).toBe(
      201,
    );
    expect((await book(b, { startDate: day(6), endDate: day(7) })).status).toBe(201);
  });

  it('refuses dates an admin campaign already covers', async () => {
    await adCampaignService.create({
      advertiserName: 'Direct',
      advertiserEmail: 'direct@example.test',
      imageUrl: `${CDN}/x.png`,
      clickUrl: 'https://direct.example',
      variant: 'inline',
      startsAt: `${day(2)}T06:00:00.000Z`,
      endsAt: `${day(4)}T06:00:00.000Z`,
      status: 'active',
    });
    const account = await register();
    expect(
      (await book(account, { variant: 'inline', startDate: day(4), endDate: day(4) })).status,
    ).toBe(409);
    expect(
      (await book(account, { variant: 'inline', startDate: day(5), endDate: day(5) })).status,
    ).toBe(201);
  });

  it('lets exactly one of many simultaneous reservations win', async () => {
    const accounts = await Promise.all(Array.from({ length: 8 }, () => register()));
    const results = await Promise.all(accounts.map((a) => book(a)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    const rows = await getDb().select().from(adCampaigns).where(eq(adCampaigns.status, 'pending'));
    expect(rows).toHaveLength(1);
    expect(gateway.sessions).toHaveLength(1);
  });

  it('frees dates when a hold lapses unpaid', async () => {
    const a = await register();
    const b = await register();
    const first = await book(a);
    expect(first.status).toBe(201);
    expect((await book(b)).status).toBe(409);

    await getDb()
      .update(adCampaigns)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(adCampaigns.id, first.body.campaignId as string));
    expect((await book(b)).status).toBe(201);
    expect((await rowOf(first.body.campaignId as string)).status).toBe('expired');

    // The first advertiser sees their lapsed hold as expired, with no payment link.
    const list = await request(app).get('/api/advertiser/campaigns').set(auth(a));
    expect(list.body.data[0]).toMatchObject({
      status: 'expired',
      checkoutUrl: null,
      holdExpiresAt: null,
    });
  });

  it('validates click URL, image host and dates at the boundary', async () => {
    const account = await register();
    expect((await book(account, { clickUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await book(account, { clickUrl: 'ftp://acme.example/x' })).status).toBe(400);
    expect((await book(account, { imageUrl: 'https://evil.example/pixel.png' })).status).toBe(400);
    expect(
      (await book(account, { imageUrl: 'https://cdn.example.test.evil.example/a.png' })).status,
    ).toBe(400);
    expect((await book(account, { acceptTerms: false })).status).toBe(400);
    expect((await book(account, { startDate: day(-2), endDate: day(1) })).status).toBe(400);
    expect((await book(account, { startDate: day(9), endDate: day(2) })).status).toBe(400);
    expect(await getDb().select().from(adCampaigns)).toHaveLength(0);
  });

  it('requires sign-in to book', async () => {
    const res = await request(app).post('/api/advertiser/bookings').send(bookingBody());
    expect(res.status).toBe(401);
  });

  it('releases the hold and answers 502 when Stripe fails', async () => {
    const account = await register();
    gateway.failCreate = true;
    const res = await book(account);
    expect(res.status).toBe(502);
    const [row] = await getDb().select().from(adCampaigns);
    expect(row?.status).toBe('expired');
    gateway.failCreate = false;
    expect((await book(account)).status).toBe(201);
  });

  it('answers 503 when payments are not configured, and the rest of the app works', async () => {
    const reg = await request(unconfiguredApp)
      .post('/api/advertiser/register')
      .send({ email: 'x@acme.example', password: PASSWORD, companyName: 'X', acceptTerms: true });
    expect(reg.status).toBe(201);
    const res = await request(unconfiguredApp)
      .post('/api/advertiser/bookings')
      .set({ authorization: `Bearer ${reg.body.token as string}` })
      .send(bookingBody());
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Payments are not configured');
    expect((await request(unconfiguredApp).get('/healthz')).status).toBe(200);
    expect(
      (
        await request(unconfiguredApp)
          .post('/api/stripe/webhook')
          .set('stripe-signature', 'x')
          .set('content-type', 'application/json')
          .send('{}')
      ).status,
    ).toBe(503);
  });
});

describe('the Stripe webhook', () => {
  it('publishes the ad when payment completes, and replays change nothing', async () => {
    const account = await register();
    const res = await book(account, { startDate: day(0), endDate: day(2) });
    const id = res.body.campaignId as string;
    const sessionId = await sessionIdOf(id);
    expect(await adCampaignService.findActive('leaderboard')).toBeNull();

    expect((await webhook(paid(sessionId))).status).toBe(200);
    const row = await rowOf(id);
    expect(row.status).toBe('active');
    expect(row.paidAt).toBeInstanceOf(Date);
    const live = await adCampaignService.findActive('leaderboard');
    expect(live).toMatchObject({ id, clickUrl: 'https://acme.example/?utm=gwj' });

    const paidAt = row.paidAt;
    expect((await webhook(paid(sessionId))).status).toBe(200);
    expect((await webhook({ type: 'checkout.session.expired', sessionId })).status).toBe(200);
    const after = await rowOf(id);
    expect(after.status).toBe('active');
    expect(after.paidAt?.getTime()).toBe(paidAt?.getTime());
    expect(gateway.refunds).toHaveLength(0);
  });

  it('shows the advertiser the lifecycle: awaiting_payment, scheduled, live, removed', async () => {
    const account = await register();
    const soon = await book(account, { startDate: day(5), endDate: day(6) });
    const now = await book(account, { variant: 'mrec', startDate: day(0), endDate: day(1) });
    const listed = async () =>
      (await request(app).get('/api/advertiser/campaigns').set(auth(account))).body.data as {
        id: string;
        status: string;
        checkoutUrl: string | null;
        startDate: string;
        endDate: string;
        amountCents: number;
      }[];
    const byId = async (id: string) => (await listed()).find((c) => c.id === id);

    const awaiting = await byId(soon.body.campaignId as string);
    expect(awaiting).toMatchObject({
      status: 'awaiting_payment',
      startDate: day(5),
      endDate: day(6),
      amountCents: AD_DAILY_RATE_CENTS.leaderboard * 2,
    });
    expect(awaiting?.checkoutUrl).toMatch(/^https:/);

    await webhook(paid(await sessionIdOf(soon.body.campaignId as string), 'pi_1'));
    await webhook(paid(await sessionIdOf(now.body.campaignId as string), 'pi_2'));
    expect((await byId(soon.body.campaignId as string))?.status).toBe('scheduled');
    expect((await byId(now.body.campaignId as string))?.status).toBe('live');
    expect((await byId(now.body.campaignId as string))?.checkoutUrl).toBeNull();

    const other = await register();
    expect(
      (await request(app).get('/api/advertiser/campaigns').set(auth(other))).body.data,
    ).toEqual([]);
  });

  it('expires the booking on checkout.session.expired and frees the dates', async () => {
    const a = await register();
    const res = await book(a);
    const id = res.body.campaignId as string;
    expect(
      (await webhook({ type: 'checkout.session.expired', sessionId: await sessionIdOf(id) }))
        .status,
    ).toBe(200);
    expect((await rowOf(id)).status).toBe('expired');
    expect((await book(await register())).status).toBe(201);
  });

  it('refunds in full, once, a payment for a booking that is no longer pending', async () => {
    const a = await register();
    const res = await book(a);
    const id = res.body.campaignId as string;
    const sessionId = await sessionIdOf(id);
    await getDb().update(adCampaigns).set({ status: 'expired' }).where(eq(adCampaigns.id, id));

    expect((await webhook(paid(sessionId, 'pi_late'))).status).toBe(200);
    expect(gateway.refunds).toEqual([
      { paymentIntentId: 'pi_late', key: `ad-refund-${sessionId}` },
    ]);
    expect((await rowOf(id)).status).toBe('expired');
    expect(await adCampaignService.findActive('leaderboard')).toBeNull();

    expect((await webhook(paid(sessionId, 'pi_late'))).status).toBe(200);
    expect(gateway.refunds).toHaveLength(1);
  });

  it('retries a failed refund on the next delivery instead of losing it', async () => {
    const a = await register();
    const id = (await book(a)).body.campaignId as string;
    const sessionId = await sessionIdOf(id);
    await getDb().update(adCampaigns).set({ status: 'cancelled' }).where(eq(adCampaigns.id, id));

    gateway.failRefund = true;
    expect((await webhook(paid(sessionId, 'pi_x'))).status).toBe(500);
    gateway.failRefund = false;
    expect((await webhook(paid(sessionId, 'pi_x'))).status).toBe(200);
    expect(gateway.refunds).toHaveLength(1);
  });

  it('ignores an unpaid completion and unknown sessions', async () => {
    const a = await register();
    const id = (await book(a)).body.campaignId as string;
    const sessionId = await sessionIdOf(id);
    await webhook({ ...paid(sessionId), paid: false });
    expect((await rowOf(id)).status).toBe('pending');
    expect((await webhook(paid('cs_unknown'))).status).toBe(200);
    expect(gateway.refunds).toHaveLength(0);
  });

  it('rejects a bad or missing signature with 400 and changes nothing', async () => {
    const a = await register();
    const id = (await book(a)).body.campaignId as string;
    const sessionId = await sessionIdOf(id);
    expect((await webhook(paid(sessionId), 'forged')).status).toBe(400);
    const unsigned = await request(app)
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .send(JSON.stringify(paid(sessionId)));
    expect(unsigned.status).toBe(400);
    expect((await rowOf(id)).status).toBe('pending');
  });

  it('verifies real Stripe signatures over the raw body', async () => {
    const secret = 'whsec_test_secret';
    const real = createStripeGateway('sk_test_unused', secret);
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_1',
        },
      },
    });
    const header = await new Stripe('sk_test_unused').webhooks.generateTestHeaderStringAsync({
      payload,
      secret,
    });
    expect(await real.constructWebhookEvent(Buffer.from(payload), header)).toEqual({
      type: 'checkout.session.completed',
      sessionId: 'cs_1',
      paid: true,
      paymentIntentId: 'pi_1',
    });
    await expect(
      real.constructWebhookEvent(Buffer.from(`${payload} `), header),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    const other = JSON.stringify({
      id: 'evt_2',
      object: 'event',
      type: 'charge.succeeded',
      data: { object: {} },
    });
    const otherHeader = await new Stripe('sk_test_unused').webhooks.generateTestHeaderStringAsync({
      payload: other,
      secret,
    });
    expect(await real.constructWebhookEvent(Buffer.from(other), otherHeader)).toBeNull();
  });
});

describe('admin removal', () => {
  it('stops the ad serving with no refund, and the advertiser sees it as removed', async () => {
    const account = await register();
    const id = (await book(account, { startDate: day(0), endDate: day(2) })).body
      .campaignId as string;
    await webhook(paid(await sessionIdOf(id)));
    expect(await adCampaignService.findActive('leaderboard')).not.toBeNull();

    await getDb()
      .insert(users)
      .values({
        id: newRecordId(),
        username: ADMIN_USERNAME,
        passwordHash: await hashPassword(ADMIN_PASSWORD, 10),
        role: 'admin',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    const admin = { authorization: `Bearer ${login.body.token as string}` };
    const patched = await request(app)
      .patch(`/api/admin/ad-campaigns/${id}`)
      .set(admin)
      .send({ status: 'cancelled' });
    expect(patched.status).toBe(200);

    expect(await adCampaignService.findActive('leaderboard')).toBeNull();
    expect(gateway.refunds).toHaveLength(0);
    const list = await request(app).get('/api/advertiser/campaigns').set(auth(account));
    expect(list.body.data[0].status).toBe('removed');
    // The admin list still renders every status, self-serve ones included.
    expect((await request(app).get('/api/admin/ad-campaigns').set(admin)).status).toBe(200);
    expect(
      (await request(app).get('/api/admin/ad-campaigns').query({ status: 'pending' }).set(admin))
        .status,
    ).toBe(200);
  });
});

describe('creative upload', () => {
  it('stores a valid image for the slot and returns its URL', async () => {
    const account = await register();
    const res = await request(app)
      .post('/api/advertiser/creative')
      .query({ variant: 'inline' })
      .set(auth(account))
      .attach('file', validPngBuffer(900, 300), {
        filename: 'banner.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(new RegExp(`^${CDN}/`));
  });

  it('rejects a wrongly shaped image for a fixed-shape slot, and anonymous uploads', async () => {
    const account = await register();
    const wrong = await request(app)
      .post('/api/advertiser/creative')
      .query({ variant: 'leaderboard' })
      .set(auth(account))
      .attach('file', validPngBuffer(500, 500), { filename: 'sq.png', contentType: 'image/png' });
    expect(wrong.status).toBe(422);
    const anon = await request(app)
      .post('/api/advertiser/creative')
      .attach('file', validPngBuffer(900, 300), { filename: 'b.png', contentType: 'image/png' });
    expect(anon.status).toBe(401);
  });
});
