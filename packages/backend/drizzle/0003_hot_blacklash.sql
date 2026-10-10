-- oxy:deploy-phase=pre
CREATE TABLE "article_channel_posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "article_channel_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"article_id" text NOT NULL,
	"channel" text NOT NULL,
	"ref" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_channel_posts_article_channel_unique" UNIQUE("article_id","channel")
);
--> statement-breakpoint
CREATE INDEX "article_channel_posts_article_id_idx" ON "article_channel_posts" USING btree ("article_id");