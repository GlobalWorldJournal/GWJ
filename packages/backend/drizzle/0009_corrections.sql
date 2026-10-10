-- oxy:deploy-phase=pre
-- Public correction notes on articles (append-only list).
ALTER TABLE "articles" ADD COLUMN "corrections" jsonb DEFAULT '[]'::jsonb NOT NULL;