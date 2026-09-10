CREATE TYPE "public"."current_status_value" AS ENUM('half_mast', 'full_mast', 'below_us', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('us', 'state');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction_level" AS ENUM('federal', 'state', 'territory');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('published', 'needs_review', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."parser_status" AS ENUM('parsed', 'changed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."social_draft_status" AS ENUM('draft', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."source_check_status" AS ENUM('changed', 'unchanged', 'failed');--> statement-breakpoint
CREATE TABLE "conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"order_ids" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "current_status" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"status" "current_status_value" NOT NULL,
	"order_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"coverage_notice" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federal_status" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"applies_to_us_flag" integer NOT NULL,
	"applies_to_state_flags" integer DEFAULT 0 NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"error" text,
	"records_found" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state_code" text,
	"level" "jurisdiction_level" NOT NULL,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"issuing_authority" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"flag_types" jsonb NOT NULL,
	"scope" text NOT NULL,
	"instruction_type" text NOT NULL,
	"instruction_text" text NOT NULL,
	"effective_start" text NOT NULL,
	"effective_end" text,
	"effective_end_time" text,
	"effective_end_condition" text,
	"time_zone" text,
	"source_url" text NOT NULL,
	"source_snapshot_id" text NOT NULL,
	"status" "order_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"text" text NOT NULL,
	"status" "social_draft_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"status" "source_check_status" NOT NULL,
	"http_status" integer,
	"content_hash" text,
	"error" text,
	"ingestion_run_id" text
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	"parser_status" "parser_status" NOT NULL,
	"ingestion_run_id" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"source_type" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"poll_interval_minutes" integer DEFAULT 30 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_successful_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"status" "current_status_value" NOT NULL,
	"order_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_status" ADD CONSTRAINT "current_status_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federal_status" ADD CONSTRAINT "federal_status_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_checks" ADD CONSTRAINT "source_checks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_checks" ADD CONSTRAINT "source_checks_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "current_status_jurisdiction_flag_idx" ON "current_status" USING btree ("jurisdiction_id","flag_type");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_state_code_idx" ON "jurisdictions" USING btree ("state_code");--> statement-breakpoint
CREATE INDEX "orders_effective_dates_idx" ON "orders" USING btree ("effective_start","effective_end");--> statement-breakpoint
CREATE INDEX "orders_jurisdiction_idx" ON "orders" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "source_checks_source_checked_idx" ON "source_checks" USING btree ("source_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_snapshots_source_hash_idx" ON "source_snapshots" USING btree ("source_id","content_hash");