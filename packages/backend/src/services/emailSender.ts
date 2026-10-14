import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Env } from '../env';

/** One outgoing email. `headers` are extra RFC 5322 headers (e.g. List-Unsubscribe). */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/**
 * Where the newsletter's mail goes out. `enabled` is false where nothing may be
 * sent (local and test backends), and callers then skip the send entirely.
 * `send` rejects when the provider refuses the message.
 */
export interface EmailSender {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
}

const CHARSET = 'UTF-8';

/** The sender that never sends: development and tests. */
export const disabledEmailSender: EmailSender = {
  enabled: false,
  async send() {
    // Nothing is sent where the newsletter is off.
  },
};

/**
 * The address and display name mail comes from. The domain must be a verified
 * SES identity (infra/ses.tf) for the sender to be accepted.
 */
export function newsletterFrom(env: Env): string {
  return `The Global World Journal <newsletter@${env.FEDIVERSE_DOMAIN}>`;
}

/** Amazon SES (v2) in production; the disabled sender everywhere else. */
export function createEmailSender(env: Env): EmailSender {
  if (env.NODE_ENV !== 'production') return disabledEmailSender;
  const from = newsletterFrom(env);
  const client = new SESv2Client({
    region: env.AWS_REGION,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  return {
    enabled: true,
    async send(message) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: CHARSET },
              Body: {
                Html: { Data: message.html, Charset: CHARSET },
                Text: { Data: message.text, Charset: CHARSET },
              },
              Headers: Object.entries(message.headers ?? {}).map(([Name, Value]) => ({
                Name,
                Value,
              })),
            },
          },
        }),
      );
    },
  };
}
