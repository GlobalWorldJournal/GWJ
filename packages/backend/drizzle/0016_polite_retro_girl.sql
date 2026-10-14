-- oxy:deploy-phase=pre
-- Newsletter subscribers (double opt-in). Additive: a new table.
CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"last_issue_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscribers_id_format" CHECK ("newsletter_subscribers"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "newsletter_subscribers_email_lowercase" CHECK ("newsletter_subscribers"."email" = lower("newsletter_subscribers"."email")),
	CONSTRAINT "newsletter_subscribers_language_check" CHECK ("newsletter_subscribers"."language" IN ('en', 'es', 'fr')),
	CONSTRAINT "newsletter_subscribers_status_check" CHECK ("newsletter_subscribers"."status" IN ('pending', 'confirmed', 'unsubscribed'))
);
--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_send_idx" ON "newsletter_subscribers" USING btree ("language","last_issue_on") WHERE "newsletter_subscribers"."status" = 'confirmed';