-- oxy:deploy-phase=pre
-- Newsroom roles: the role CHECK widens to admin|editor (existing admins stay
-- valid) and accounts can be deactivated. Additive for the running release.
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin', 'editor'));