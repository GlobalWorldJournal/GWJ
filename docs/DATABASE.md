# Database (PostgreSQL + Drizzle)

GWJ's backend stores everything in PostgreSQL through Drizzle ORM over
postgres.js. Production is the logical database **`gwj`**, owned by the login
role **`gwj`**, on the shared RDS instance `oxy-postgres`
(`postgres.internal.oxy.so:5432`, TLS required); the connection string is SSM
`/gwj/DATABASE_URL`. GWJ shares that INSTANCE only — no database, role, table or
row with any other application. It replaced the self-managed MongoDB
(`gwj-mongo`) on the cutover described in `docs/POSTGRES-CUTOVER.md`.

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
packages/mongo-migration/      ONE-TIME Mongo → Postgres copy + verify (deleted at decommission)
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

## Schema and how each Mongo collection maps

| Mongo | PostgreSQL | key | notes |
|---|---|---|---|
| `articles` | `articles` | `id` text, 24-hex | ids are the original ObjectId hex: they are inside every federated Note/Create/Announce id, admin URLs and MCP history. New ids keep that shape (`src/db/ids.ts`). `heroImage`, `seo`, `source` are `jsonb`; `tags` is `text[]`. |
| `users` | `users` | `id` text, 24-hex | id is the JWT `sub`; bcrypt hash copied verbatim |
| `actorkeys` | `actor_keys` | `username` | RSA keypairs copied verbatim; generated lazily with `ON CONFLICT DO NOTHING` |
| `followers` | `followers` | identity `id`; unique `(actor_username, actor_id)` | `id` is the newest-first tie-break `_id` used to be |
| `categories` | — | — | not ported: never read; the closed `CATEGORIES` tuple serves `/api/categories` and backs `articles_category_check` |

Constraints made structural (each enforced by every writer before, and with zero
violating rows in production): slug unique; status/category/language/role sets;
`featured >= 0`; `(status = 'published') = (published_at IS NOT NULL)`.

Indexes, ported one-for-one: `(status, published_at DESC NULLS LAST)`,
`(language, status, published_at DESC NULLS LAST)`,
`(category, published_at DESC NULLS LAST)`, GIN on `search_vector`; followers
`(actor_username, followed_at DESC, id DESC)`.

## Behaviour carried over from Mongo on purpose

- **Ordering**: `published_at DESC NULLS LAST` everywhere Mongo sorted it
  descending (Postgres would otherwise put NULL first), plus an `id` tie-break.
- **Search** (`articleRepository.parseSearch`) keeps `$text` semantics: bare
  terms are OR-ed; a `"quoted phrase"` must match (terms then only rank); `-term`
  excludes; only exclusions or only stop words match nothing. Fields: title +
  deck (the old index), NOT body. Each row is stemmed with its own language
  (`en`/`es`/`fr`, like Mongo's `language_override`); queries are parsed as
  English (the index `default_language`). Known consequence, unchanged from
  Mongo: an inflected Spanish/French query term may not match a Spanish/French
  article; passing the edition's configuration would be a deliberate behaviour
  change, not part of the port.
- **No-op saves**: an update that changes no value writes nothing and does not
  move `updated_at` (Mongoose's `save()` on an unmodified document).
- **Follower upsert** keeps a stored `sharedInbox` when a repeat Follow omits it
  (Mongo's `$set: { x: undefined }` was a no-op).
- **Edits are serialized** per article (`SELECT … FOR UPDATE`), so concurrent
  publishes fan out to the fediverse exactly once.
