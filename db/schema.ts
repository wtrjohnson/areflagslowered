import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const jurisdictionLevel = pgEnum("jurisdiction_level", ["federal", "state", "territory"]);
export const flagType = pgEnum("flag_type", ["us", "state"]);
export const orderStatus = pgEnum("order_status", ["published", "needs_review", "rejected"]);
export const sourceCheckStatus = pgEnum("source_check_status", ["changed", "unchanged", "failed"]);
export const parserStatus = pgEnum("parser_status", ["parsed", "changed", "failed"]);
export const currentStatusValue = pgEnum("current_status_value", ["half_mast", "full_mast", "below_us", "uncertain"]);
export const socialDraftStatus = pgEnum("social_draft_status", ["draft", "approved", "rejected", "published"]);
export const sourcePriority = pgEnum("source_priority", ["primary", "secondary", "fallback"]);

export const jurisdictions = pgTable("jurisdictions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stateCode: text("state_code"),
  level: jurisdictionLevel("level").notNull(),
  timeZone: text("time_zone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ stateCodeIdx: uniqueIndex("jurisdictions_state_code_idx").on(table.stateCode) }));

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  sourceType: text("source_type").notNull(),
  priority: sourcePriority("priority").notNull().default("primary"),
  parserName: text("parser_name").notNull(),
  timeZone: text("time_zone").notNull().default("America/New_York"),
  enabled: integer("enabled").notNull().default(1),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(30),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastSuccessfulAt: timestamp("last_successful_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastLatencyMs: integer("last_latency_ms"),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),
  error: text("error"),
  recordsFound: integer("records_found").notNull().default(0),
});

export const sourceChecks = pgTable("source_checks", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  status: sourceCheckStatus("status").notNull(),
  httpStatus: integer("http_status"),
  responseLatencyMs: integer("response_latency_ms"),
  contentHash: text("content_hash"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  error: text("error"),
  ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id),
}, (table) => ({ sourceCheckedIdx: index("source_checks_source_checked_idx").on(table.sourceId, table.checkedAt) }));

export const sourceSnapshots = pgTable("source_snapshots", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  url: text("url").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  content: text("content").notNull(),
  parserStatus: parserStatus("parser_status").notNull(),
  ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id),
}, (table) => ({ sourceHashIdx: uniqueIndex("source_snapshots_source_hash_idx").on(table.sourceId, table.contentHash) }));

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  issuingAuthority: text("issuing_authority").notNull(),
  jurisdictionId: text("jurisdiction_id").notNull().references(() => jurisdictions.id),
  flagTypes: jsonb("flag_types").$type<string[]>().notNull(),
  scope: text("scope").notNull(),
  instructionType: text("instruction_type").notNull(),
  instructionText: text("instruction_text").notNull(),
  effectiveStart: text("effective_start").notNull(),
  effectiveStartTime: text("effective_start_time"),
  effectiveEnd: text("effective_end"),
  effectiveEndTime: text("effective_end_time"),
  effectiveEndCondition: text("effective_end_condition"),
  timeZone: text("time_zone"),
  sourceUrl: text("source_url").notNull(),
  sourceSnapshotId: text("source_snapshot_id").notNull().references(() => sourceSnapshots.id),
  status: orderStatus("status").notNull(),
  alertType: text("alert_type").notNull().default("new"),
  geographicScope: text("geographic_scope").notNull().default("statewide"),
  countyName: text("county_name"),
  sourceMessageId: text("source_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ effectiveDatesIdx: index("orders_effective_dates_idx").on(table.effectiveStart, table.effectiveEnd), jurisdictionIdx: index("orders_jurisdiction_idx").on(table.jurisdictionId) }));

export const federalStatus = pgTable("federal_status", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  appliesToUsFlag: integer("applies_to_us_flag").notNull(),
  appliesToStateFlags: integer("applies_to_state_flags").notNull().default(0),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
});

export const inboundEmails = pgTable("inbound_emails", {
  id: text("id").primaryKey(),
  providerMessageId: text("provider_message_id"),
  contentHash: text("content_hash").notNull(),
  sender: text("sender"),
  recipient: text("recipient"),
  subject: text("subject"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  rawEmail: text("raw_email").notNull(),
  extractedJson: jsonb("extracted_json"),
  processingStatus: text("processing_status").notNull(),
  error: text("error"),
  orderId: text("order_id").references(() => orders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerMessageIdx: uniqueIndex("inbound_emails_provider_message_idx").on(table.providerMessageId),
  contentHashIdx: uniqueIndex("inbound_emails_content_hash_idx").on(table.contentHash),
}));

export const currentStatus = pgTable("current_status", {
  id: text("id").primaryKey(),
  jurisdictionId: text("jurisdiction_id").notNull().references(() => jurisdictions.id),
  flagType: flagType("flag_type").notNull(),
  status: currentStatusValue("status").notNull(),
  orderIds: jsonb("order_ids").$type<string[]>().notNull().default([]),
  sourceId: text("source_id").references(() => sources.id),
  sourceUrl: text("source_url"),
  confidence: text("confidence").notNull().default("official"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  coverageNotice: text("coverage_notice").notNull(),
}, (table) => ({ currentStatusKey: uniqueIndex("current_status_jurisdiction_flag_idx").on(table.jurisdictionId, table.flagType) }));

export const statusHistory = pgTable("status_history", {
  id: text("id").primaryKey(),
  jurisdictionId: text("jurisdiction_id").notNull().references(() => jurisdictions.id),
  flagType: flagType("flag_type").notNull(),
  status: currentStatusValue("status").notNull(),
  orderIds: jsonb("order_ids").$type<string[]>().notNull().default([]),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  sourceUrl: text("source_url"),
  reason: text("reason").notNull(),
});

export const manualOverrides = pgTable("manual_overrides", {
  id: text("id").primaryKey(),
  jurisdictionId: text("jurisdiction_id").notNull().references(() => jurisdictions.id),
  flagType: flagType("flag_type").notNull(),
  status: currentStatusValue("status").notNull(),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  active: integer("active").notNull().default(1),
});

export const conflicts = pgTable("conflicts", {
  id: text("id").primaryKey(),
  jurisdictionId: text("jurisdiction_id").notNull().references(() => jurisdictions.id),
  flagType: flagType("flag_type").notNull(),
  orderIds: jsonb("order_ids").$type<string[]>().notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const socialDrafts = pgTable("social_drafts", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  text: text("text").notNull(),
  status: socialDraftStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
