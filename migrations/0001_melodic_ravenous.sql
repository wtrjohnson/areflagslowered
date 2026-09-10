CREATE TYPE "public"."source_priority" AS ENUM('primary', 'secondary', 'fallback');--> statement-breakpoint
CREATE TABLE "manual_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"status" "current_status_value" NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "current_status" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "current_status" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "current_status" ADD COLUMN "confidence" text DEFAULT 'official' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "priority" "source_priority" DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "parser_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "status_history" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "status_history" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_status" ADD CONSTRAINT "current_status_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;