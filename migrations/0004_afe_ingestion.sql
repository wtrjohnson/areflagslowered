ALTER TABLE "orders" ADD COLUMN "alert_type" text DEFAULT 'new' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "geographic_scope" text DEFAULT 'statewide' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "county_name" text;
ALTER TABLE "orders" ADD COLUMN "source_message_id" text;
CREATE TABLE "inbound_emails" (
  "id" text PRIMARY KEY NOT NULL,
  "provider_message_id" text,
  "content_hash" text NOT NULL,
  "sender" text,
  "recipient" text,
  "subject" text,
  "received_at" timestamp with time zone NOT NULL,
  "raw_email" text NOT NULL,
  "extracted_json" jsonb,
  "processing_status" text NOT NULL,
  "error" text,
  "order_id" text REFERENCES "orders"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "inbound_emails_provider_message_idx" ON "inbound_emails" USING btree ("provider_message_id");
CREATE UNIQUE INDEX "inbound_emails_content_hash_idx" ON "inbound_emails" USING btree ("content_hash");
