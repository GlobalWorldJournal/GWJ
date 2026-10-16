/**
 * An in-memory Oxy Files for tests: the same URL functions as production
 * (`createOxyUrls`), the SDK's real file-event verification, and a store that
 * behaves like Oxy's for what GWJ relies on — one file per (application,
 * bytes), import-by-URL answering the file it made before, references that
 * only exist for files that exist, and a reconciliation that makes the stored
 * references exactly the inventory.
 */
import { createHash } from 'node:crypto';
import { verifyFileEventSignature } from '@oxy.so/core/server';
import { HttpError } from '../errors';
import {
  InvalidFileEventError,
  storageError,
  type OxyFileReference,
  type OxyFileReferenceOutcome,
  type OxyFiles,
  type StoredOxyFile,
} from '../media/oxyFiles';
import { createOxyUrls } from '../media/oxyUrls';
import { createLegacyMedia } from '../media/legacy';
import { createMediaPresenter, type MediaPresenter } from '../media/presentation';

export const FAKE_CLOUD_URL = 'https://cloud.example.test';
export const FAKE_WEBHOOK_SECRET = 'whsec_test_secret';

export interface FakeStoredFile extends StoredOxyFile {
  bytes: Uint8Array;
  originalName?: string;
  status: 'active' | 'trash' | 'deleted';
}

/** An Oxy-shaped error (status + code), as the SDK throws. */
export class FakeOxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'HttpRequestError';
  }
}

export interface FakeOxyFiles extends OxyFiles {
  readonly files: Map<string, FakeStoredFile>;
  /** `entityType|entityId|fileId` of every reference held. */
  readonly references: Set<string>;
  /** Bytes a remote URL answers when imported (absent: the source fails, 502). */
  readonly remote: Map<string, { bytes: Uint8Array; mime: string }>;
  /** How many downloads imports made (a repeat import makes none). */
  downloads: number;
  /** The next store/import fails with this (once). */
  failNext: FakeOxyError | null;
  referencesOf(entityType: string, entityId: string): string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function refKey(reference: { entityType: string; entityId: string; fileId: string }): string {
  return `${reference.entityType}|${reference.entityId}|${reference.fileId}`;
}

export function createFakeOxyFiles(options: { webhookSecret?: string } = {}): FakeOxyFiles {
  const urls = createOxyUrls(FAKE_CLOUD_URL);
  const files = new Map<string, FakeStoredFile>();
  const bySha = new Map<string, string>();
  const imported = new Map<string, string>();
  const references = new Set<string>();
  const remote = new Map<string, { bytes: Uint8Array; mime: string }>();
  let counter = 0;
  const webhookSecret = options.webhookSecret ?? FAKE_WEBHOOK_SECRET;

  function store(bytes: Uint8Array, mime: string, originalName?: string): FakeStoredFile {
    const hash = sha256(bytes);
    const existing = bySha.get(hash);
    const known = existing ? files.get(existing) : undefined;
    if (known && known.status !== 'deleted') {
      known.status = 'active';
      return known;
    }
    counter += 1;
    const fileId = `fakefile${String(counter).padStart(8, '0')}`;
    const file: FakeStoredFile = {
      fileId,
      sha256: hash,
      mime,
      size: bytes.byteLength,
      bytes: new Uint8Array(bytes),
      status: 'active',
      ...(originalName ? { originalName } : {}),
    };
    files.set(fileId, file);
    bySha.set(hash, fileId);
    return file;
  }

  function takeFailure(): void {
    if (fake.failNext) {
      const failure = fake.failNext;
      fake.failNext = null;
      throw storageError(failure);
    }
  }

  const fake: FakeOxyFiles = {
    ...urls,
    eventsConfigured: webhookSecret.length > 0,
    files,
    references,
    remote,
    downloads: 0,
    failNext: null,

    referencesOf(entityType, entityId) {
      return [...references]
        .filter((key) => key.startsWith(`${entityType}|${entityId}|`))
        .map((key) => key.split('|')[2] ?? '');
    },

    async uploadImage(bytes, mime, originalName) {
      takeFailure();
      const {
        bytes: _bytes,
        status: _status,
        originalName: _name,
        ...stored
      } = store(bytes, mime, originalName);
      return stored;
    },

    async importImage(sourceUrl) {
      takeFailure();
      const known = imported.get(sourceUrl);
      const knownFile = known ? files.get(known) : undefined;
      if (knownFile && knownFile.status === 'active') {
        const { bytes: _bytes, status: _status, originalName: _name, ...stored } = knownFile;
        return stored;
      }
      const source = remote.get(sourceUrl);
      if (!source) throw storageError(new FakeOxyError(502, 'SOURCE_FETCH_FAILED'));
      fake.downloads += 1;
      const file = store(source.bytes, source.mime);
      imported.set(sourceUrl, file.fileId);
      const { bytes: _bytes, status: _status, originalName: _name, ...stored } = file;
      return stored;
    },

    async readImage(fileId, maxBytes) {
      const file = files.get(fileId);
      if (file?.status !== 'active') throw new HttpError(422, 'not readable');
      if (file.bytes.byteLength > maxBytes) throw new HttpError(422, 'too large');
      return file.bytes;
    },

    async addReferences(items: OxyFileReference[]): Promise<OxyFileReferenceOutcome[]> {
      return items.map((item) => {
        const file = files.get(item.fileId);
        if (!file || file.status === 'deleted') return 'not_found';
        file.status = 'active';
        if (references.has(refKey(item))) return 'exists';
        references.add(refKey(item));
        return 'created';
      });
    },

    async removeReferences(items: OxyFileReference[]): Promise<OxyFileReferenceOutcome[]> {
      return items.map((item) => (references.delete(refKey(item)) ? 'removed' : 'not_found'));
    },

    async reconcile(entityType, items, { dryRun }) {
      const wanted = new Set<string>();
      let refused = 0;
      for await (const item of items) {
        const file = files.get(item.fileId);
        if (!file || file.status === 'deleted') {
          refused += 1;
          continue;
        }
        wanted.add(refKey({ entityType, ...item }));
      }
      const held = [...references].filter((key) => key.startsWith(`${entityType}|`));
      const added = [...wanted].filter((key) => !references.has(key));
      const removed = held.filter((key) => !wanted.has(key));
      if (!dryRun) {
        for (const key of added) references.add(key);
        for (const key of removed) references.delete(key);
      }
      return {
        added: added.length,
        removed: removed.length,
        unchanged: wanted.size - added.length,
        refused,
      };
    },

    async listFiles(cursor) {
      const all = [...files.values()].filter((file) => file.status !== 'deleted');
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 100);
      return {
        files: page.map((file) => ({
          fileId: file.fileId,
          sha256: file.sha256,
          status: file.status,
        })),
        ...(start + 100 < all.length ? { nextCursor: String(start + 100) } : {}),
      };
    },

    verifyEvent(rawBody, headers) {
      try {
        return verifyFileEventSignature(rawBody, headers, webhookSecret);
      } catch (error) {
        throw new InvalidFileEventError(error instanceof Error ? error.message : String(error));
      }
    },
  };
  return fake;
}

/** The reader-facing presenter over the fake's URLs and the tests' legacy CDN. */
export function testPresenter(legacyCdn = 'https://cdn.example.test'): MediaPresenter {
  return createMediaPresenter(createOxyUrls(FAKE_CLOUD_URL), createLegacyMedia(legacyCdn));
}
