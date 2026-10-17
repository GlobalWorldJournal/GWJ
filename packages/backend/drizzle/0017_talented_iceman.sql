-- oxy:deploy-phase=pre
ALTER TABLE "articles" ADD COLUMN "sources" jsonb;