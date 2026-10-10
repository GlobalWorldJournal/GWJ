-- oxy:deploy-phase=pre
-- Agent credentials: one hashed, scoped, revocable token per agent.
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_name_unique" UNIQUE("name"),
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "api_tokens_id_format" CHECK ("api_tokens"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "api_tokens_scopes_check" CHECK ("api_tokens"."scopes" <@ ARRAY['articles:write', 'articles:publish', 'articles:delete', 'media:upload', 'takedowns']::text[])
);
