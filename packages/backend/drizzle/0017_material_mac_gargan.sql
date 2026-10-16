-- oxy:deploy-phase=pre
-- Media on Oxy Files (ADR 0041 stage 4). Additive: new tables for the reference
-- outbox and mirror, file-event audit and state, the nightly reconciliation
-- lease, writer portraits, the legacy-bucket map and legacy-read counts; three
-- nullable columns on media_assets.
CREATE TABLE "legacy_media_objects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "legacy_media_objects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"image_key" text,
	"rendition_width" integer,
	"size" bigint NOT NULL,
	"etag" text,
	"content_type" text,
	"sha256" text,
	"oxy_file_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"copied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_media_objects_key_unique" UNIQUE("key"),
	CONSTRAINT "legacy_media_objects_kind_check" CHECK ("legacy_media_objects"."kind" IN ('image', 'rendition', 'social_card', 'writer_portrait')),
	CONSTRAINT "legacy_media_objects_status_check" CHECK ("legacy_media_objects"."status" IN ('pending', 'copied', 'mapped', 'failed')),
	CONSTRAINT "legacy_media_objects_copied_check" CHECK ("legacy_media_objects"."status" NOT IN ('copied', 'mapped') OR "legacy_media_objects"."oxy_file_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "legacy_media_reads" (
	"day" date NOT NULL,
	"surface" text NOT NULL,
	"count" bigint NOT NULL,
	CONSTRAINT "legacy_media_reads_pkey" PRIMARY KEY("day","surface")
);
--> statement-breakpoint
CREATE TABLE "media_file_references" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_file_references_pkey" PRIMARY KEY("entity_type","entity_id","file_id"),
	CONSTRAINT "media_file_references_entity_type_check" CHECK ("media_file_references"."entity_type" IN ('article', 'ad_campaign', 'social_card', 'writer_portrait'))
);
--> statement-breakpoint
CREATE TABLE "media_reconcile_runs" (
	"entity_type" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"last_error" text,
	CONSTRAINT "media_reconcile_runs_entity_type_check" CHECK ("media_reconcile_runs"."entity_type" IN ('article', 'ad_campaign', 'social_card', 'writer_portrait'))
);
--> statement-breakpoint
CREATE TABLE "media_reference_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_reference_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_reference_jobs_entity_type_check" CHECK ("media_reference_jobs"."entity_type" IN ('article', 'ad_campaign', 'social_card', 'writer_portrait')),
	CONSTRAINT "media_reference_jobs_status_check" CHECK ("media_reference_jobs"."status" IN ('pending', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "oxy_file_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"file_id" text NOT NULL,
	"file_status" text NOT NULL,
	"file_visibility" text NOT NULL,
	"references" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oxy_file_states" (
	"file_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"visibility" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oxy_file_states_status_check" CHECK ("oxy_file_states"."status" IN ('active', 'trash', 'blocked', 'deleted')),
	CONSTRAINT "oxy_file_states_visibility_check" CHECK ("oxy_file_states"."visibility" IN ('public', 'unlisted', 'private'))
);
--> statement-breakpoint
CREATE TABLE "writer_portraits" (
	"username" text PRIMARY KEY NOT NULL,
	"oxy_file_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "oxy_file_id" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "mime" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
CREATE INDEX "legacy_media_objects_status_idx" ON "legacy_media_objects" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "media_file_references_file_idx" ON "media_file_references" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_reference_jobs_pending_entity_unique" ON "media_reference_jobs" USING btree ("entity_type","entity_id") WHERE "media_reference_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "media_reference_jobs_due_idx" ON "media_reference_jobs" USING btree ("next_attempt_at") WHERE "media_reference_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "oxy_file_events_file_idx" ON "oxy_file_events" USING btree ("file_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "oxy_file_states_hidden_idx" ON "oxy_file_states" USING btree ("file_id") WHERE "oxy_file_states"."status" <> 'active' OR "oxy_file_states"."visibility" = 'private';--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_oxy_file_id_unique" UNIQUE("oxy_file_id");