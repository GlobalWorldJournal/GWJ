-- oxy:deploy-phase=post
-- Runs once only the new image serves (it always sets translation_group_id).
-- Rows the previous image inserted during the rollout get their own group first.
UPDATE "articles" SET "translation_group_id" = "id" WHERE "translation_group_id" IS NULL;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "translation_group_id" SET NOT NULL;
