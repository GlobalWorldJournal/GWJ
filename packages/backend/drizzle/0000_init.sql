-- oxy:deploy-phase=pre
-- Initial schema: the four tables ported from MongoDB (articles, users, actor_keys, followers).
CREATE TABLE "actor_keys" (
	"username" text PRIMARY KEY NOT NULL,
	"private_key_pem" text NOT NULL,
	"public_key_pem" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"deck" text,
	"kicker" text,
	"category" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"hero_image" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector(
  CASE "language" WHEN 'es' THEN 'spanish'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'english'::regconfig END,
  coalesce("title", '') || ' ' || coalesce("deck", '')
)) STORED,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "articles_id_format" CHECK ("articles"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "articles_status_check" CHECK ("articles"."status" IN ('draft', 'published')),
	CONSTRAINT "articles_category_check" CHECK ("articles"."category" IN ('World', 'Business', 'Markets', 'Tech', 'Politics', 'Opinion', 'Arts')),
	CONSTRAINT "articles_language_check" CHECK ("articles"."language" IN ('en', 'es', 'fr')),
	CONSTRAINT "articles_featured_check" CHECK ("articles"."featured" >= 0),
	CONSTRAINT "articles_published_at_check" CHECK (("articles"."status" = 'published') = ("articles"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "followers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "followers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_username" text NOT NULL,
	"actor_id" text NOT NULL,
	"inbox" text NOT NULL,
	"shared_inbox" text,
	"followed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followers_actor_username_actor_id_unique" UNIQUE("actor_username","actor_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_id_format" CHECK ("users"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin'))
);
--> statement-breakpoint
CREATE INDEX "articles_status_published_at_idx" ON "articles" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_language_status_published_at_idx" ON "articles" USING btree ("language","status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_category_published_at_idx" ON "articles" USING btree ("category","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_search_vector_idx" ON "articles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "followers_actor_username_followed_at_idx" ON "followers" USING btree ("actor_username","followed_at" DESC NULLS LAST,"id" DESC NULLS LAST);