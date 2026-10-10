-- oxy:deploy-phase=pre
-- takedown_requests: the notice-and-takedown collection (feat/takedown-requests), ported from MongoDB.
CREATE TABLE "takedown_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"article_url" text,
	"image_url" text,
	"claim_type" text NOT NULL,
	"explanation" text NOT NULL,
	"good_faith_assertion" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"article_id" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "takedown_requests_id_format" CHECK ("takedown_requests"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "takedown_requests_claim_type_check" CHECK ("takedown_requests"."claim_type" IN ('copyright', 'subject-rights', 'other')),
	CONSTRAINT "takedown_requests_status_check" CHECK ("takedown_requests"."status" IN ('pending', 'actioned', 'dismissed')),
	CONSTRAINT "takedown_requests_good_faith_check" CHECK ("takedown_requests"."good_faith_assertion")
);
--> statement-breakpoint
CREATE INDEX "takedown_requests_status_created_at_idx" ON "takedown_requests" USING btree ("status","created_at" DESC NULLS LAST);