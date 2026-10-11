-- oxy:deploy-phase=pre
CREATE TABLE "mention_oauth" (
	"resource" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token_endpoint" text NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"access_token" text NOT NULL,
	"access_expires_at" bigint NOT NULL,
	"refresh_token" text NOT NULL,
	"refresh_claimed_at" bigint,
	"refresh_fail_count" integer DEFAULT 0 NOT NULL,
	"refresh_fail_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
