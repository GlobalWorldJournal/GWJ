-- oxy:deploy-phase=post
-- One media_assets row per stored Oxy file: the same bytes stored again answer
-- the same file, so the hash of the SUBMITTED bytes is no longer the dedupe key.
-- Dropped after the rollout: the previous image still inserts expecting it.
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_sha256_unique";