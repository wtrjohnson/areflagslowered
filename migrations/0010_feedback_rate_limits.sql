CREATE TABLE IF NOT EXISTS "feedback_rate_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL
);
