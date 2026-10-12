-- oxy:deploy-phase=pre
CREATE TABLE "advertisers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"company_name" text NOT NULL,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertisers_email_unique" UNIQUE("email"),
	CONSTRAINT "advertisers_id_format" CHECK ("advertisers"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "advertisers_email_lowercase" CHECK ("advertisers"."email" = lower("advertisers"."email"))
);
--> statement-breakpoint
ALTER TABLE "ad_campaigns" DROP CONSTRAINT "ad_campaigns_status_check";--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "advertiser_id" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "ad_name" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "stripe_session_id" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_advertisers_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_campaigns_stripe_session_id_unique" ON "ad_campaigns" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_advertiser_idx" ON "ad_campaigns" USING btree ("advertiser_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_status_check" CHECK ("ad_campaigns"."status" IN ('active', 'paused', 'cancelled', 'pending', 'expired'));