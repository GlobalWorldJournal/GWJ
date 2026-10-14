import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import request from 'supertest';
import type { Express } from 'express';
import { CATEGORIES, NEWSLETTER_TIME_ZONES } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../env';
import { buildApp } from '../app';
import { getDb } from '../db/client';
import { newsletterSubscribers } from '../db/schema/newsletterSubscribers';
import { eq } from 'drizzle-orm';
import { articleService } from '../services/articleService';
import type { EmailMessage, EmailSender } from '../services/emailSender';
import { localTime, sendDueIssues } from '../services/newsletterSender';
import type { NewsletterService } from '../services/newsletterService';
import { useTestDatabase, type TestDatabase } from '../test/postgres';

let testDb: TestDatabase;
let app: Express;
let service: NewsletterService;
let sent: EmailMessage[];
let failFor: string | null;

const sender: EmailSender = {
  enabled: true,
  async send(message) {
    if (failFor === message.to) throw new Error('SES refused the address');
    sent.push(message);
  },
};

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = 'nate';
  process.env.ADMIN_PASSWORD = 'super-secret-pw';
  process.env.AWS_REGION = 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com';
  resetEnvCache();
  return loadEnv();
}

beforeAll(async () => {
  testDb = await useTestDatabase();
  const built = buildApp(setTestEnv(), { emailSender: sender });
  app = built.app;
  service = built.newsletter.service;
});

beforeEach(async () => {
  await testDb.truncateAll();
  sent = [];
  failFor = null;
});

afterAll(async () => {
  await testDb.drop();
});

const tokenIn = (mail: EmailMessage | undefined): string => {
  const match = /token=([^\s"&]+)/.exec(mail?.text ?? '');
  if (!match?.[1]) throw new Error('no token in the email');
  return decodeURIComponent(match[1]);
};

const rowFor = async (email: string) =>
  (
    await getDb().select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email))
  )[0];

const subscribe = (email: string, language = 'en') =>
  request(app).post('/api/newsletter/subscribe').send({ email, language });

/** Sign-up through the service: the HTTP route is rate limited per IP, which a suite shares. */
const subscribeDirect = (email: string, language: 'en' | 'es' | 'fr' = 'en') =>
  service.subscribe({ email, language });

async function confirmed(email: string, language: 'en' | 'es' | 'fr' = 'en'): Promise<void> {
  await subscribeDirect(email, language);
  const res = await request(app)
    .post('/api/newsletter/confirm')
    .send({ token: tokenIn(sent[sent.length - 1]) });
  expect(res.status).toBe(200);
}

describe('subscribing', () => {
  it('stores a pending subscriber and mails one confirmation in their edition', async () => {
    const res = await subscribe('Reader@Example.com', 'es');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'pending_confirmation' });
    const row = await rowFor('reader@example.com');
    expect(row?.status).toBe('pending');
    expect(row?.language).toBe('es');
    expect(row?.confirmationSentAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('reader@example.com');
    expect(sent[0]?.text).toContain('/es/newsletter/confirm?token=');
  });

  it('does not mail a second confirmation right away, nor reveal a confirmed address', async () => {
    await subscribe('reader@example.com');
    await subscribe('reader@example.com');
    expect(sent).toHaveLength(1);
    await confirmed('other@example.com');
    const before = sent.length;
    const res = await subscribe('other@example.com');
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(before);
  });

  it('rejects a bad address, an unknown edition and a filled honeypot', async () => {
    expect((await subscribe('not-an-email')).status).toBe(400);
    expect((await subscribe('a@example.com', 'de')).status).toBe(400);
    const bot = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'a@example.com', language: 'en', website: 'http://spam.test' });
    expect(bot.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});

describe('confirming and unsubscribing', () => {
  it('confirms from the emailed link', async () => {
    await subscribeDirect('reader@example.com');
    const res = await request(app)
      .post('/api/newsletter/confirm')
      .send({ token: tokenIn(sent[0]) });
    expect(res.body).toEqual({ status: 'confirmed', language: 'en' });
    const row = await rowFor('reader@example.com');
    expect(row?.status).toBe('confirmed');
    expect(row?.confirmedAt).not.toBeNull();
  });

  it('refuses a forged or foreign token', async () => {
    const res = await request(app).post('/api/newsletter/confirm').send({ token: 'forged' });
    expect(res.status).toBe(400);
    await confirmed('reader@example.com');
    const row = await rowFor('reader@example.com');
    const unsubscribeToken = service.unsubscribeToken(row?.id ?? '');
    const asConfirm = await request(app)
      .post('/api/newsletter/confirm')
      .send({ token: unsubscribeToken });
    expect(asConfirm.status).toBe(400);
  });

  it('unsubscribes with the one-click POST a mail client sends (token in the query)', async () => {
    await confirmed('reader@example.com');
    const row = await rowFor('reader@example.com');
    const token = encodeURIComponent(service.unsubscribeToken(row?.id ?? ''));
    const res = await request(app)
      .post(`/api/newsletter/unsubscribe?token=${token}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unsubscribed');
    expect((await rowFor('reader@example.com'))?.status).toBe('unsubscribed');
  });

  it('never resubscribes through an old confirmation link, but a new request restarts', async () => {
    await subscribeDirect('reader@example.com');
    const oldLink = tokenIn(sent[0]);
    const row = await rowFor('reader@example.com');
    await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ token: service.unsubscribeToken(row?.id ?? '') });
    const stale = await request(app).post('/api/newsletter/confirm').send({ token: oldLink });
    expect(stale.status).toBe(400);
    expect((await rowFor('reader@example.com'))?.status).toBe('unsubscribed');
    await subscribeDirect('reader@example.com');
    expect((await rowFor('reader@example.com'))?.status).toBe('pending');
  });
});

describe('claiming recipients', () => {
  it('hands each confirmed reader of an edition out once per issue date', async () => {
    await confirmed('a@example.com');
    await confirmed('b@example.com');
    await confirmed('es@example.com', 'es');
    await subscribeDirect('pending@example.com');
    const first = await service.claimRecipients('en', '2026-10-14', 10);
    expect(first.map((r) => r.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(await service.claimRecipients('en', '2026-10-14', 10)).toHaveLength(0);
    expect(await service.claimRecipients('en', '2026-10-15', 10)).toHaveLength(2);
  });
});

describe('sending the daily issue', () => {
  async function publishStories(count: number, language: 'en' | 'es' = 'en'): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      const draft = await articleService.create({
        title: `Story ${language} ${i}`,
        category: CATEGORIES[0],
        language,
        author: 'Nate',
        body: '# Story\n\nSomething happened.',
        status: 'draft',
        featured: 0,
        tags: [],
        seo: {},
      });
      await articleService.publish(draft.id);
    }
  }

  /** A moment today when it is 07:30 in the English edition's zone. */
  function morning(): Date {
    const t = new Date();
    t.setUTCMinutes(30, 0, 0);
    for (let h = 0; h < 24; h += 1) {
      t.setUTCHours(h);
      if (localTime(t, NEWSLETTER_TIME_ZONES.en).hour === 7) return t;
    }
    throw new Error('no 07:00 hour found');
  }

  const deps = () => ({
    service,
    sender,
    articles: articleService,
    apiBaseUrl: 'https://api.example.test',
  });

  it('mails each confirmed reader one issue with working unsubscribe links, once per day', async () => {
    await publishStories(3);
    await confirmed('a@example.com');
    await confirmed('b@example.com');
    sent = [];
    const now = morning();
    const results = await sendDueIssues(deps(), now);
    expect(results).toEqual([{ language: 'en', sent: 2, failed: 0 }]);
    expect(sent.map((m) => m.to).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(sent[0]?.html).toContain('/article/');
    expect(sent[0]?.headers?.['List-Unsubscribe']).toContain(
      'https://api.example.test/api/newsletter/unsubscribe?token=',
    );
    expect(await sendDueIssues(deps(), now)).toEqual([]);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing outside the window or with too few fresh stories', async () => {
    await confirmed('a@example.com');
    sent = [];
    await publishStories(2);
    expect(await sendDueIssues(deps(), morning())).toEqual([]);
    await publishStories(1);
    const early = new Date(morning().getTime() - 3 * 60 * 60 * 1000);
    expect(await sendDueIssues(deps(), early)).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('counts a refused address as failed and still mails the others', async () => {
    await publishStories(3);
    await confirmed('good@example.com');
    await confirmed('bad@example.com');
    sent = [];
    failFor = 'bad@example.com';
    const results = await sendDueIssues(deps(), morning());
    expect(results).toEqual([{ language: 'en', sent: 1, failed: 1 }]);
    expect(sent.map((m) => m.to)).toEqual(['good@example.com']);
  });
});
