ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "official_source_url" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "official_source_title" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "official_source_publisher" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "official_source_published_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "official_source_status" text NOT NULL DEFAULT 'not_available';
CREATE INDEX IF NOT EXISTS "orders_official_source_status_idx" ON "orders" USING btree ("official_source_status");
