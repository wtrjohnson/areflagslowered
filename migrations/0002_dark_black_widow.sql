ALTER TABLE "source_checks" ADD COLUMN "response_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "source_checks" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "source_checks" ADD COLUMN "last_modified" text;