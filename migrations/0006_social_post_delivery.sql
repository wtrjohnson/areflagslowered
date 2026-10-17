ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "external_post_id" text;
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "publish_error" text;
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "publish_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;
