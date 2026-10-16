# Media on Oxy Files

Every image GWJ stores is a file of **GWJ's own Oxy application** on Oxy Files
(Oxy ADR 0041, stage 4). The application owns it — not the editor, agent or
advertiser who uploaded it (newsroom content belongs to the publication; who
uploaded what is GWJ's own audit, `media_assets.uploaded_by`). GWJ uses nothing
else of Oxy: no sign-in, no accounts, no Oxy data.

The legacy bucket (`gwj-media` behind `cdn.globalworldjournal.com`) is
**read-only** from this change on and is retired by the procedure at the end.

## How it works

One adapter, `packages/backend/src/media/oxyFiles.ts`, is the only importer of
`@oxy.so/core/server` and the only thing that talks to Oxy Files.

| What GWJ stores | Owner | Oxy call | Reference (`entityType` / `entityId`) |
|---|---|---|---|
| Editor/agent upload (`POST /api/admin/upload`) | GWJ application | `uploadAppFile` (public) after GWJ's validation, metadata strip and WebP re-encode | `article` / article id, once an article shows it |
| Remote image (`POST /api/admin/upload/from-url`, MCP `upload_image {url}`) | GWJ application | `importAppFile` (Oxy's SSRF-safe fetcher, remembers the URL) → bytes read back, SHA-256 checked → same pipeline as an upload. The raw import is never shown or referenced: Oxy collects it | `article` / article id |
| Ad creative (admin and self-serve) | GWJ application | `uploadAppFile` | `ad_campaign` / campaign id |
| Instagram social card | GWJ application | `uploadAppFile`, stored verbatim (JPEG) | `social_card` / `<articleId>:<channel>`, while the post is recorded |
| Writer portrait (`PUT /api/admin/writers/:username/portrait`, PNG, square, ≥ 256 px) | GWJ application | `uploadAppFile`, stored verbatim | `writer_portrait` / fediverse username |

- **URLs.** Content stores the file's public URL, `https://cloud.oxy.so/<id>`
  (`assets.publicUrl`). `srcset` uses Oxy's WebP renditions narrower than the
  image (`w320`, `w640`, `w1280`, `w2048`; none for a GIF). Writer portraits are
  served through the stable `GET /api/writers/<username>/portrait` (a redirect),
  which pages and the writers' fediverse icons use.
- **An `article` uses** every file its hero image, Markdown body or
  `seo.ogImage` shows — now or in any of its revisions, so a restorable revision
  keeps its images alive.
- **References are registered at every write** through a durable outbox
  (`media_reference_jobs`, written in the transaction of the change): an
  article created, edited, restored or deleted; an ad booked, edited or
  deleted; a channel post recorded or retracted; a portrait replaced. The worker
  (`media/referenceWorker.ts`, every backend task) diffs what the entity shows
  now against what is registered (`media_file_references`) and adds and removes
  the difference, with backoff (1 min doubling to 6 h, 10 attempts). Removing a
  reference never deletes anything: a GWJ file nothing uses is moved to trash by
  Oxy after 24 hours and purged 30 days later (ADR 0041 D5); a new reference
  restores it before then.
- **Nightly reconciliation** (`media/reconcile.ts`, one task holds a lease per
  entity type in `media_reconcile_runs`) sends Oxy the complete inventory of
  each entity type, read from the content itself; Oxy adds what was missed and
  removes what is stale (D6). A non-zero `added`/`removed` is logged as a
  warning: a reference write was missed.
- **File events** (D9) arrive at `POST /api/oxy/file-events` (raw body, before
  the JSON parser), verified with `verifyFileEventSignature`. Each event is
  recorded once (`oxy_file_events`: the dedupe key and the audit — type, file,
  resulting status/visibility, GWJ's references, when it happened, when it
  arrived, `applied` or `superseded`) and the newest state per file is kept in
  `oxy_file_states`. A file that is `blocked` (a takedown, D10), in `trash`,
  `deleted` or `private` is **hidden** on every reader-facing path — public API
  (hero, body image, og:image; an ad gives its slot back), ActivityPub outbox,
  distribution channels, newsletter — by `media/presentation.ts`. Nothing is
  rewritten: an `unblocked`/`restored` event shows it again, and the admin view
  keeps it. A store or import of taken-down bytes answers 422
  `content-blocked` (Oxy's 451): final, the agent picks another source.

## Setting it up (once per environment)

1. **Register GWJ's application** in the Oxy console under GWJ's developer
   account, type `third_party` (GWJ is not Oxy; its stored bytes count toward
   that account's plan, D3). Grant it `files:app:write`, `files:app:delete`
   and `files:references:write` (self-service for a third-party application,
   D11) and create a SERVICE credential.
2. **Before merging**, create the parameters and the task-definition revision
   that reads them, then put the credential in:

   ```bash
   terraform -chdir=infra apply \
     -target=aws_ssm_parameter.oxy_application_key \
     -target=aws_ssm_parameter.oxy_application_secret \
     -target=aws_ssm_parameter.oxy_files_webhook_secret \
     -target=aws_ecs_task_definition.backend
   aws ssm put-parameter --overwrite --type SecureString --name /gwj/OXY_APPLICATION_KEY --value …
   aws ssm put-parameter --overwrite --type SecureString --name /gwj/OXY_APPLICATION_SECRET --value …
   ```

   The backend refuses to boot in production without them.
3. Merge; CI deploys (the release is registered on top of that revision).
4. Once the new image is stable, the full `terraform apply`: it narrows the task
   role to READ-ONLY on the legacy bucket (applied earlier, a rollback to the
   previous image could not upload).
5. Register the file-events endpoint
   `https://api.globalworldjournal.com/api/oxy/file-events` (console → Webhooks →
   File events). It answers Oxy's challenge on its own; the secret Oxy shows
   ONCE goes into `/gwj/OXY_FILES_WEBHOOK_SECRET`; then
   `aws ecs update-service --force-new-deployment` for `gwj-backend`. Until
   then events answer 503 and Oxy retries them (up to 16 attempts over days).
6. Run the migration below.

| Env | SSM | Notes |
|---|---|---|
| `OXY_APPLICATION_KEY`, `OXY_APPLICATION_SECRET` | `/gwj/OXY_APPLICATION_*` | required in production |
| `OXY_FILES_WEBHOOK_SECRET` | `/gwj/OXY_FILES_WEBHOOK_SECRET` | `-` until the endpoint is registered |
| `OXY_API_URL`, `OXY_CLOUD_URL` | — | default `https://api.oxy.so`, `https://cloud.oxy.so` |
| `S3_BUCKET`, `CDN_BASE_URL` | task environment | the LEGACY bucket; removed at retirement |

## Migrating the legacy bucket

`packages/backend/src/media/migrateToOxy.ts` (logic: `legacyMigration.ts`),
run as an ECS one-shot from the backend image (database, read-only bucket and
GWJ's credential are all there). Never run it locally against production data.

```bash
AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster scripts/ecs-oneshot.sh gwj-backend oxy-files-preview -- \
  bun run src/media/migrateToOxy.ts --target-database=gwj --mode=preview
AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster scripts/ecs-oneshot.sh gwj-backend oxy-files-apply -- \
  bun run src/media/migrateToOxy.ts --target-database=gwj --mode=apply
```

- **preview** lists and classifies every object and counts what the rewrite
  would change. It writes nothing anywhere.
- **apply** (resumable — every object's outcome is a row of
  `legacy_media_objects`; re-run until it passes):
  1. copies every object VERBATIM into a GWJ file and accepts it only if Oxy's
     SHA-256 of what it stored equals the SHA-256 of the bucket's bytes; GWJ's
     old `srcset` renditions (`*.w400.webp`…) are not copied but mapped to
     their image (Oxy renders its own);
  2. rewrites every legacy URL in articles (hero, body, og:image), revisions,
     ad creatives and `media_assets` to its Oxy URL — a technical fill-in, not
     an edit (no `updated_at`, revision or redistribution) — and records the
     roster portraits in `writer_portraits`;
  3. reconciles every entity type with Oxy, so everything GWJ shows is
     referenced before Oxy's sweep could collect it. Copied objects nothing
     shows (orphan uploads, old social cards) stay unreferenced and follow D5;
  4. verifies every copied file is in Oxy with the recorded hash and no legacy
     URL is left in the content.
- The JSON report carries counts, row ids and SHA-256s — never a key or URL.
  Verdict `PASS` needs: no failed object that the content shows, no missing or
  mismatched file, zero legacy URLs left, the reconciliation run. A failed
  object nothing shows is listed but does not block.

**Order matters:** run `apply` (its reconciliation is GWJ's first) **before Oxy
switches its lifecycle sweep to `enforce`** — until then every GWJ file reads
to Oxy as unused, and an enforced sweep trashes an unused application file
after 24 hours.

## The soak (dual read)

Content can hold legacy CDN URLs and Oxy URLs side by side; both render. Every
legacy URL GWJ hands out is counted per day in `legacy_media_reads`
(`api`: an article or ad served with one; `portrait`: a portrait not yet in
Oxy; `redirect`: an old URL resolved through `/legacy-media/`). After a PASS,
`api` and `portrait` must stay at zero.

## Retiring the bucket

Only when ALL of these hold:

1. `migrateToOxy --mode=apply` reported `PASS` (keep the report);
2. 14 consecutive days of zero `api` and `portrait` reads:
   `select day, surface, count from legacy_media_reads where surface <> 'redirect' order by day desc;`
3. `migrateToOxy --mode=apply` re-run at the end of the soak still `PASS`es
   with `copy.copied = 0` (nothing new appeared in the bucket).

Then, in one PR + `terraform apply`:

- point `cdn.globalworldjournal.com` at the backend's `/legacy-media/` (the
  CloudFront distribution's origin becomes the API origin with origin path
  `/legacy-media`), so links in sent newsletters and federated posts keep
  resolving: `GET /legacy-media/<key>` 301s to the Oxy file it was copied to
  (`legacy_media_objects` is that map and is kept);
- remove the bucket (`infra/cdn.tf`'s `aws_s3_bucket.media` and its policy,
  versioning and OAC), the task role's `ecs_task_s3` policy (`infra/iam.tf`),
  the `S3_BUCKET` environment of the backend task (`infra/ecs.tf`) and in
  `env.ts`, `migrateToOxy.ts` / `legacyMigration.ts` and with them the
  backend's last use of `@aws-sdk/client-s3` (the map table and the redirect
  stay);
- `CDN_BASE_URL` stays as long as the legacy redirect does: it is how a legacy
  URL is recognized.

Empty the bucket (all versions) before `terraform destroy` of it; nothing in it
is needed once the three conditions hold.
