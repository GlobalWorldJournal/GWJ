-- oxy:deploy-phase=post
-- Runs once only the new image serves (it no longer reads or writes these).
-- No outlet provenance and no outlet photo credits, in stories or their history.
UPDATE "articles" SET "hero_image" = "hero_image" - 'credit' WHERE "hero_image" ? 'credit';--> statement-breakpoint
UPDATE "article_revisions" SET "snapshot" = "snapshot" - 'source' - 'sources' WHERE "snapshot" ?| array['source', 'sources'];--> statement-breakpoint
UPDATE "article_revisions" SET "snapshot" = "snapshot" #- '{heroImage,credit}' WHERE "snapshot"->'heroImage' ? 'credit';--> statement-breakpoint
ALTER TABLE "articles" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "articles" DROP COLUMN "sources";
