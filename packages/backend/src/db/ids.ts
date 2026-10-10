/**
 * The primary key format for `articles` and `users`: 24 lowercase hex characters,
 * the exact textual form of a MongoDB ObjectId.
 *
 * Kept on purpose after the port. Every row copied from Mongo keeps its ObjectId
 * as its id, because that id already left the database: it is embedded in every
 * federated ActivityPub Note/Create/Announce id (`noteId(author, article.id)`),
 * in admin URLs, in MCP agents' tool history and in issued JWT `sub` claims. A
 * new id scheme would silently re-identify every published Note on the fediverse.
 *
 * New rows get an id of the same shape — a 4-byte big-endian seconds timestamp
 * followed by 8 random bytes — so one format holds for the whole table and ids
 * still sort roughly by creation time, as ObjectIds did.
 */
import { randomBytes } from 'node:crypto';

export const RECORD_ID_PATTERN = /^[0-9a-f]{24}$/;
/** The same pattern as a SQL regex, for the CHECK constraints. */
export const RECORD_ID_SQL_PATTERN = '^[0-9a-f]{24}$';

const TIMESTAMP_BYTES = 4;
const RANDOM_BYTES = 8;

export function newRecordId(now: Date = new Date()): string {
  const timestamp = Buffer.alloc(TIMESTAMP_BYTES);
  timestamp.writeUInt32BE(Math.floor(now.getTime() / 1000));
  return Buffer.concat([timestamp, randomBytes(RANDOM_BYTES)]).toString('hex');
}

/** Whether a caller-supplied id can name a row at all (malformed ⇒ 404, never a query). */
export function isRecordId(value: string): boolean {
  return RECORD_ID_PATTERN.test(value);
}
