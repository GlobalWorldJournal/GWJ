-- oxy:deploy-phase=pre
-- The distribution outbox: per-channel publish/update/retract jobs, written in
-- the same transaction as the article change, worked with leases and retries.
CREATE TABLE "channel_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "channel_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"article_id" text NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_jobs_action_check" CHECK ("channel_jobs"."action" IN ('publish', 'update', 'retract')),
	CONSTRAINT "channel_jobs_status_check" CHECK ("channel_jobs"."status" IN ('pending', 'done', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "channel_jobs_pending_idx" ON "channel_jobs" USING btree ("next_attempt_at") WHERE "channel_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "channel_jobs_article_channel_idx" ON "channel_jobs" USING btree ("article_id","channel","id");