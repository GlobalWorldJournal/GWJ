-- oxy:deploy-phase=pre
-- Search covers the body too, weighted headline (A) > deck (B) > body (C).
-- SET EXPRESSION (PostgreSQL 17) recomputes the generated column in place and
-- rebuilds its GIN index; drizzle's drop+add would have dropped that index.
-- The previous image keeps working: same column, same type.
-- Ships in a release AFTER 0005 (post): a pre migration may not queue behind an
-- unapplied post one.
ALTER TABLE "articles" ALTER COLUMN "search_vector" SET EXPRESSION AS (setweight(to_tsvector(CASE "language" WHEN 'es' THEN 'spanish'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'english'::regconfig END, coalesce("title", '')), 'A')
  || setweight(to_tsvector(CASE "language" WHEN 'es' THEN 'spanish'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'english'::regconfig END, coalesce("deck", '')), 'B')
  || setweight(to_tsvector(CASE "language" WHEN 'es' THEN 'spanish'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'english'::regconfig END, coalesce("body", '')), 'C'));--> statement-breakpoint
CREATE INDEX "articles_published_feed_idx" ON "articles" USING btree ("language","featured" DESC NULLS LAST,"published_at" DESC NULLS LAST) WHERE "articles"."status" = 'published';--> statement-breakpoint
CREATE INDEX "articles_tags_idx" ON "articles" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "articles_author_published_at_idx" ON "articles" USING btree ("author","published_at" DESC NULLS LAST);