-- oxy:deploy-phase=pre
-- Linked translations: articles.translation_group_id groups the language editions
-- of one story (one article per language per group). Nullable here so the
-- previous image keeps inserting during the rollout; 0005 (post) makes it NOT NULL.
ALTER TABLE "articles" ADD COLUMN "translation_group_id" text;--> statement-breakpoint
-- Every existing article is the only edition of its story: its own group.
UPDATE "articles" SET "translation_group_id" = "id" WHERE "translation_group_id" IS NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_translation_group_language_unique" UNIQUE("translation_group_id","language");