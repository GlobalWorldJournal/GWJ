# Database (PostgreSQL + Drizzle)

GWJ's backend stores everything in PostgreSQL through Drizzle ORM over
postgres.js. Production is the logical database **`gwj`**, owned by the login
role **`gwj`**, on the shared RDS instance `oxy-postgres`
(`postgres.internal.oxy.so:5432`, TLS required); the connection string is SSM
`/gwj/DATABASE_URL`. GWJ shares that INSTANCE only — no database, role, table or
row with any other application.

## Layout

```
packages/backend/
  drizzle.config.ts            generation only (drizzle-kit); never applies
  drizzle/                     generated migrations + meta/ (journal, snapshots)
  src/db/schema/*.ts           one file per table
  src/db/client.ts             connectDb / getDb / disconnectDb (one pool per process)
  src/db/migrator.ts           ledger + deploy-phase planner + runner
  src/db/migrate.ts            the CLI: the ONLY way a migration is applied
  src/db/repositories/         article queries (incl. search)
  src/test/postgres.ts         realdb harness: one throwaway database per test file
```

## Commands

```bash
docker compose up -d postgres migrate                       # local server + schema
bun run --cwd packages/backend db:generate                   # after a schema change
bun run --cwd packages/backend db:migrate --target-database=gwj   # apply (DATABASE_URL)
DRY_RUN=true bun run --cwd packages/backend db:migrate --target-database=gwj
TEST_POSTGRES_URL=postgres://gwj:gwj@127.0.0.1:5432/postgres bun run test
```

## Rules

- **Migrations are applied only by `src/db/migrate.ts`** (locally, by
  `docker compose`'s `migrate` service, and in production by the deploy's ECS
  one-shot). Never `drizzle-kit migrate`, never by hand.
- **`--target-database=<name>` is required** on every run and asserted against
  `current_database()`; a migrator pointed at the wrong database otherwise
  reports success over an untouched one.
- **Every generated `.sql` carries exactly one `-- oxy:deploy-phase=pre|post`
  line.** `pre` = additive (safe while the previous image serves); `post` =
  drops/renames/narrowed constraints (applied after the rollout). An unmarked
  file fails before any DDL. drizzle-kit cannot add it: add it by hand after
  `db:generate`, and READ the generated SQL for statements you did not intend.
- **Never rename a migration, edit `meta/_journal.json` or write a snapshot by
  hand.** The ledger (`drizzle.__drizzle_migrations`) is a high-water mark on the
  journal `when`; the migrator refuses an entry stranded below it.
- **The backend refuses to boot** while a `pre` migration in its image is
  unapplied — crash-loop (and ECS rollback) instead of 500s.
- **Growing a closed set is a migration.** `articles.category`, `.language` and
  `.status` and `users.role` carry CHECK constraints rendered from the tuples in
  `@gwj/shared-types` (`CATEGORIES`, `SUPPORTED_LANGUAGES`, …). Adding a value
  means: change the tuple, `db:generate`, add the `pre` marker, ship both together.
  `schema.realdb.test.ts` inserts every tuple value, so forgetting fails CI.
- **A value interpolated into a `check()` becomes `$1` in the migration** and
  fails at apply time — use `sqlInList` / `sql.raw` for constants (a test fails on
  any `$N` in a migration).
- **SQLSTATE lives on `err.cause`** under drizzle; use `src/db/pgErrors.ts`
  (`isUniqueViolation`, `constraintNameOf`), never `err.code`.
- **Use `ON CONFLICT`, not catch-and-reread**, for idempotent inserts: a catch
  cannot tell a duplicate from a dropped connection, and a failed statement
  aborts the whole transaction.
- **Tests that touch the database are `*.realdb.test.ts`** and run against a
  real server (`TEST_POSTGRES_URL`); there is no mock and no skip. Each file gets
  its own migrated database, so `truncateAll()` in a hook is safe.

## Schema

| table | key | notes |
|---|---|---|
| `articles` | `id` text, 24-hex | The id is embedded in every federated Note/Create/Announce id, admin URLs and MCP history, so its format is fixed (`src/db/ids.ts`). `heroImage`, `seo`, `corrections` are `jsonb`; `tags` is `text[]`; `translation_group_id` links the language editions of one story (unique per language); `search_vector` is a generated `tsvector`. |
| `article_slug_history` | `slug` | former slugs, kept so old URLs 301 to the current one; FK to `articles`, cascade |
| `article_revisions` | identity `id` | the editable state before each change and who made it, written in the same transaction; FK to `articles`, cascade |
| `article_channel_posts` | identity `id`; unique `(article_id, channel)` | where each article was delivered per distribution channel; no FK (a retraction runs after the article row is gone) |
| `channel_jobs` | identity `id` | the distribution outbox, written in the same transaction as the article change; no FK, for the same reason |
| `users` | `id` text, 24-hex | id is the JWT `sub`; bcrypt hash, never serialized |
| `api_tokens` | `id` text, 24-hex | one per agent, scoped and revocable; only the SHA-256 of the secret is stored |
| `actor_keys` | `username` | RSA keypair per ActivityPub actor, used verbatim; generated lazily with `ON CONFLICT DO NOTHING` |
| `followers` | identity `id`; unique `(actor_username, actor_id)` | `id` is the newest-first listing tie-break and never leaves the database |
| `takedown_requests` | `id` text, 24-hex | `article_id` is a plain 24-hex string with no FK: a request keeps naming a deleted article |
| `ad_campaigns` | `id` text, 24-hex | directly sold bookings, one slot variant each; `ends_at > starts_at` |
| `mention_oauth` | `resource` | the single sealed OAuth grant for the Mention channel |

Categories are not a table: the closed `CATEGORIES` tuple serves `/api/categories`
and backs `articles_category_check`.

Structural constraints: slug unique; status/category/language/role sets;
`featured >= 0`; `(status = 'published') = (published_at IS NOT NULL)`; a
scheduled article is a draft.

Article listing indexes put `published_at DESC NULLS LAST` after their filter
columns (`status`, `language, status`, `category`, `author`, and the published
feed `language, featured DESC`); GIN on `search_vector` and on `tags`; a partial
index on `scheduled_at`. Followers: `(actor_username, followed_at DESC, id DESC)`;
takedown_requests and ad_campaigns: `(status, created_at DESC)`, plus a live-window index on ad_campaigns.
`schema.realdb.test.ts` asserts the core indexes by name.

## Behaviour

- **Ordering**: `published_at DESC NULLS LAST` (Postgres would otherwise put NULL
  first), plus an `id` tie-break so pagination is deterministic.
- **Search** (`articleRepository.parseSearch`): bare terms are OR-ed; a
  `"quoted phrase"` must match (terms then only rank); `-term` excludes; only
  exclusions or only stop words match nothing. Fields: title (weight A), deck
  (B) and body (C). Each row is stemmed with its own language
  (`en`/`es`/`fr` → `english`/`spanish`/`french`), and the query is parsed once
  per edition in that edition's language, so an inflected word finds the article
  written in that language.
- **No-op saves**: an update that changes no value writes nothing and does not
  move `updated_at`.
- **Follower upsert** keeps a stored `sharedInbox` when a repeat Follow omits it
  (an absent field is not a removal).
- **Edits are serialized** per article (`SELECT … FOR UPDATE`), so concurrent
  publishes fan out to the fediverse exactly once.
