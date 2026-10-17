CREATE TABLE IF NOT EXISTS "inbound_review_events" (
  "id" text PRIMARY KEY NOT NULL,
  "inbound_email_id" text NOT NULL,
  "event_type" text NOT NULL,
  "operator_email" text,
  "note" text,
  "candidate_snapshot" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inbound_review_events_inbound_email_id_inbound_emails_id_fk"
    FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE no action ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "inbound_review_events_inbound_created_idx" ON "inbound_review_events" USING btree ("inbound_email_id", "created_at");
