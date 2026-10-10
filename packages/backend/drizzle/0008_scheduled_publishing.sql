-- oxy:deploy-phase=pre
-- Scheduled publishing: a draft with scheduled_at goes live when it is due.
-- The previous image never sets it, so the new CHECK holds during the rollout.
ALTER TABLE "articles" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "articles_scheduled_at_idx" ON "articles" USING btree ("scheduled_at") WHERE "articles"."scheduled_at" is not null;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_scheduled_draft_check" CHECK ("articles"."scheduled_at" is null or "articles"."status" = 'draft');