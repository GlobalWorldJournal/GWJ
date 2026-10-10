-- oxy:deploy-phase=pre
-- Uploaded images with their sizes and srcset renditions. Additive: a new table.
CREATE TABLE "media_assets" (
	"url" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_sha256_unique" UNIQUE("sha256")
);
