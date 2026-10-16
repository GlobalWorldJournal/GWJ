/**
 * GWJ's ONE adapter to Oxy Files (ADR 0041). Every byte GWJ stores goes
 * through here, as a file the GWJ APPLICATION owns (never a person: newsroom
 * content belongs to the publication; who uploaded it is GWJ's own audit), and
 * every use GWJ makes of a file is registered here as a reference. Nothing else
 * in GWJ imports `@oxy.so/core`.
 *
 * GWJ is an Oxy Files customer, not part of Oxy: it holds a service credential
 * of its own application (`OXY_APPLICATION_KEY`/`_SECRET`) with
 * `files:app:write` and `files:references:write`, and uses nothing else of Oxy
 * — no sign-in, no accounts, no Oxy data.
 *
 * Every file GWJ stores is an image (JPEG/PNG/WebP/GIF, `validateImageBuffer`),
 * which is what Oxy Files accepts today.
 */
import { OxyServer, verifyFileEventSignature } from '@oxy.so/core/server';
import type { FileEvent, FileWebhookChallenge } from '@oxy.so/core/server';
import type { Env } from '../env';
import {
  BadRequestError,
  HttpError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from '../errors';
import { createOxyUrls, type OxyUrls } from './oxyUrls';

/** A file GWJ stored in (or imported into) Oxy Files. */
export interface StoredOxyFile {
  fileId: string;
  /** SHA-256 of the bytes Oxy stored. */
  sha256: string;
  mime: string;
  size: number;
}

/** One use of a file by one of GWJ's records. */
export interface OxyFileReference {
  fileId: string;
  entityType: string;
  entityId: string;
}

export type OxyFileReferenceOutcome = 'created' | 'exists' | 'removed' | 'not_found';

export interface OxyReconcileResult {
  added: number;
  removed: number;
  unchanged: number;
  refused: number;
}

/** One of GWJ's files as Oxy lists it. */
export interface ListedOxyFile {
  fileId: string;
  sha256: string;
  status: string;
}

export type OxyFileEvent = FileEvent;
export type OxyFileWebhookChallenge = FileWebhookChallenge;
type HeaderBag = Parameters<typeof verifyFileEventSignature>[1];

export interface OxyFiles extends OxyUrls {
  /** Whether a signing secret for file events is configured. */
  readonly eventsConfigured: boolean;
  /** Store image bytes as a public GWJ file. Idempotent per bytes (Oxy dedupes). */
  uploadImage(bytes: Uint8Array, mime: string, originalName?: string): Promise<StoredOxyFile>;
  /**
   * Have Oxy fetch a remote image (its SSRF-safe fetcher: https only, public
   * addresses, bounded redirects/size/time) into a public GWJ file. The same
   * URL imported again answers the file it already made, without a download.
   */
  importImage(sourceUrl: string): Promise<StoredOxyFile>;
  /** Read a public file's original bytes back (at most `maxBytes`). */
  readImage(fileId: string, maxBytes: number): Promise<Uint8Array>;
  addReferences(references: OxyFileReference[]): Promise<OxyFileReferenceOutcome[]>;
  removeReferences(references: OxyFileReference[]): Promise<OxyFileReferenceOutcome[]>;
  /** ADR 0041 D6: make Oxy's references of `entityType` exactly `items`. */
  reconcile(
    entityType: string,
    items: AsyncIterable<{ fileId: string; entityId: string }>,
    options: { dryRun: boolean },
  ): Promise<OxyReconcileResult>;
  /** One page of GWJ's own files, newest first. */
  listFiles(cursor?: string): Promise<{ files: ListedOxyFile[]; nextCursor?: string }>;
  /**
   * Verify one request to the file-events endpoint and return its event. The
   * endpoint's verification challenge is returned unchecked (that is how the
   * endpoint gets its secret); anything else needs `OXY_FILES_WEBHOOK_SECRET`.
   */
  verifyEvent(rawBody: Uint8Array, headers: HeaderBag): OxyFileEvent | OxyFileWebhookChallenge;
}

/** Thrown for a request Oxy refused as a file event: answer 400, never process it. */
export class InvalidFileEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFileEventError';
  }
}

/** Reading a stored image back from Oxy's CDN. */
const READ_TIMEOUT_MS = 30_000;
const NOT_CONFIGURED = 'Oxy Files is not configured (OXY_APPLICATION_KEY / OXY_APPLICATION_SECRET)';

function statusOf(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

function codeOf(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

/**
 * Turn Oxy's answer to a store or an import into the error GWJ's API gives its
 * caller: what the caller can act on (a refused URL, an unusable source, taken
 * down bytes) keeps its meaning; anything else is Oxy's failure and stays one.
 */
export function storageError(error: unknown): unknown {
  if (error instanceof HttpError) return error;
  const status = statusOf(error);
  const code = codeOf(error);
  const message = error instanceof Error ? error.message : String(error);
  switch (status) {
    case 400:
      return new BadRequestError(`Image URL not allowed: ${message}`);
    case 413:
      return new UnprocessableEntityError(`Image too large: ${message}`, { reason: 'too-large' });
    case 415:
      return new UnprocessableEntityError(`Source URL did not return an image: ${message}`, {
        reason: 'not-image',
      });
    case 422:
      return code === 'SOURCE_URL_REFUSED'
        ? new BadRequestError(`Image URL not allowed: ${message}`)
        : new UnprocessableEntityError(`Image refused: ${message}`, { reason: 'refused' });
    // Taken down after a rights or privacy claim (ADR 0041 D10): those bytes
    // can never be stored again, by anyone. Final — another source is needed.
    case 451:
      return new UnprocessableEntityError('This image was taken down and cannot be used', {
        reason: 'content-blocked',
      });
    case 502:
      return new UnprocessableEntityError(`Source image could not be downloaded: ${message}`, {
        reason: 'fetch-failed',
      });
    case 504:
      return new UnprocessableEntityError('Source image download timed out', {
        reason: 'timeout',
      });
    default:
      return error;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UnprocessableEntityError(`Image is larger than ${maxBytes} bytes`, {
      reason: 'too-large',
    });
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new UnprocessableEntityError(`Image is larger than ${maxBytes} bytes`, {
      reason: 'too-large',
    });
  }
  return body;
}

export interface OxyFilesConfig {
  apiUrl: string;
  cloudUrl: string;
  credential?: { apiKey: string; apiSecret: string };
  webhookSecret?: string;
  /** Test seam for `readImage`. */
  fetch?: typeof fetch;
}

export function oxyFilesConfigFrom(env: Env): OxyFilesConfig {
  return {
    apiUrl: env.OXY_API_URL,
    cloudUrl: env.OXY_CLOUD_URL,
    ...(env.OXY_APPLICATION_KEY && env.OXY_APPLICATION_SECRET
      ? {
          credential: { apiKey: env.OXY_APPLICATION_KEY, apiSecret: env.OXY_APPLICATION_SECRET },
        }
      : {}),
    ...(env.OXY_FILES_WEBHOOK_SECRET ? { webhookSecret: env.OXY_FILES_WEBHOOK_SECRET } : {}),
  };
}

/**
 * The adapter over the real Oxy API. Without a credential (local development)
 * every call that needs one answers 503; the URL functions still work, so
 * stored content renders.
 */
export function createOxyFiles(config: OxyFilesConfig): OxyFiles {
  const urls = createOxyUrls(config.cloudUrl);
  const doFetch = config.fetch ?? fetch;
  const server = config.credential
    ? new OxyServer({
        baseURL: config.apiUrl,
        cloudURL: urls.cloudUrl,
        serviceAuth: config.credential,
      })
    : null;

  function assets() {
    if (!server) throw new ServiceUnavailableError(NOT_CONFIGURED);
    return server.assets;
  }

  return {
    ...urls,
    eventsConfigured: Boolean(config.webhookSecret),

    async uploadImage(bytes, mime, originalName) {
      try {
        const { file } = await assets().uploadAppFile(bytes, mime, {
          visibility: 'public',
          ...(originalName ? { originalName } : {}),
        });
        return { fileId: file.id, sha256: file.sha256, mime: file.mime, size: file.size };
      } catch (error) {
        throw storageError(error);
      }
    },

    async importImage(sourceUrl) {
      try {
        const { file } = await assets().importAppFile(sourceUrl, { visibility: 'public' });
        return { fileId: file.id, sha256: file.sha256, mime: file.mime, size: file.size };
      } catch (error) {
        throw storageError(error);
      }
    },

    async readImage(fileId, maxBytes) {
      const response = await doFetch(urls.url(fileId), {
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new UnprocessableEntityError(
          `The stored image could not be read back (HTTP ${response.status})`,
          { reason: 'fetch-failed', status: response.status },
        );
      }
      return readCapped(response, maxBytes);
    },

    async addReferences(references) {
      if (references.length === 0) return [];
      const results = await assets().references.add(references);
      return results.map((item) => item.result);
    },

    async removeReferences(references) {
      if (references.length === 0) return [];
      const results = await assets().references.remove(references);
      return results.map((item) => item.result);
    },

    async reconcile(entityType, items, options) {
      const result = await assets().references.reconcile(entityType, items, {
        dryRun: options.dryRun,
      });
      return {
        added: result.added,
        removed: result.removed,
        unchanged: result.unchanged,
        refused: result.refused,
      };
    },

    async listFiles(cursor) {
      const page = await assets().listAppFiles({ limit: 100, ...(cursor ? { cursor } : {}) });
      return {
        files: page.files.map((file) => ({
          fileId: file.id,
          sha256: file.sha256,
          status: file.status,
        })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },

    verifyEvent(rawBody, headers) {
      try {
        return verifyFileEventSignature(rawBody, headers, config.webhookSecret ?? '');
      } catch (error) {
        throw new InvalidFileEventError(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
