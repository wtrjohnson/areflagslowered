CREATE TABLE IF NOT EXISTS "social_preview_snapshots" (
  "token" text PRIMARY KEY NOT NULL,
  "social_draft_id" text NOT NULL,
  "jurisdiction_id" text NOT NULL,
  "us_status" "current_status_value" NOT NULL,
  "state_status" "current_status_value" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "social_preview_snapshots_jurisdiction_id_jurisdictions_id_fk"
    FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "social_preview_snapshots_social_draft_id_social_drafts_id_fk"
    FOREIGN KEY ("social_draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE no action ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_preview_snapshots_draft_idx" ON "social_preview_snapshots" USING btree ("social_draft_id");
CREATE INDEX IF NOT EXISTS "social_preview_snapshots_jurisdiction_idx" ON "social_preview_snapshots" USING btree ("jurisdiction_id");
