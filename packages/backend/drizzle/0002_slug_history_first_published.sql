-- oxy:deploy-phase=pre
-- Stable slugs + publish-once fan-out: a slug-history table (old slugs 301 to the
-- current one) and articles.first_published_at (never cleared on unpublish).
CREATE TABLE "article_slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article_slug_history" ADD CONSTRAINT "article_slug_history_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_slug_history_article_id_idx" ON "article_slug_history" USING btree ("article_id");--> statement-breakpoint
-- Backfill: every currently published article first went live no later than its
-- publishedAt (re-publish preserved publishedAt), so that is its first publish.
UPDATE "articles" SET "first_published_at" = "published_at" WHERE "published_at" IS NOT NULL;
