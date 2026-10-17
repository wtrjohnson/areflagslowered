import { createXPostDraft, jurisdictionUrl } from "./social.ts";
import { createShareToken, previewAltText, type PreviewStatus } from "./share-preview-core.ts";
import { jurisdictionByCode, type JurisdictionDefinition } from "./jurisdictions.ts";
import type { AfeExtraction } from "./afe-extractor.ts";
import type { HalfMastOrder } from "./types.ts";

export type TestAlertScenario = {
  stateCode: string;
  reason: string;
  effectiveStart: string;
  effectiveEnd?: string;
  alertType: "new" | "correction";
  usStatus: PreviewStatus;
  stateStatus: PreviewStatus;
};

export type TestAlertResult = {
  jurisdiction: Pick<JurisdictionDefinition, "id" | "name" | "stateCode" | "slug" | "flagAsset">;
  usStatus: PreviewStatus;
  stateStatus: PreviewStatus;
  socialText: string;
  simulatedShareUrl: string;
  previewAlt: string;
  extraction?: AfeExtraction;
  notes: string[];
};

function assertDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must use YYYY-MM-DD.`);
}

export function createTestAlertResult(scenario: TestAlertScenario, extraction?: AfeExtraction): TestAlertResult {
  const jurisdiction = jurisdictionByCode(scenario.stateCode);
  if (!jurisdiction) throw new Error("Choose a supported state or territory.");
  assertDate(scenario.effectiveStart, "Start date");
  if (scenario.effectiveEnd) assertDate(scenario.effectiveEnd, "End date");
  if (scenario.effectiveEnd && scenario.effectiveEnd < scenario.effectiveStart) throw new Error("End date cannot be before start date.");
  const reason = scenario.reason.replace(/\s+/g, " ").trim();
  if (!reason) throw new Error("Add a reason for the test alert.");
  const simulatedToken = createShareToken();
  const order: HalfMastOrder = {
    id: `test-${simulatedToken}`,
    title: `Test ${jurisdiction.name} half-mast alert`,
    reason,
    issuingAuthority: "Test console",
    jurisdiction,
    flagTypes: scenario.usStatus === "half_mast" ? ["us", "state"] : ["state"],
    scope: "statewide",
    instructionType: "order",
    instructionText: "Dry-run only. No order is created.",
    effectiveStart: scenario.effectiveStart,
    effectiveEnd: scenario.effectiveEnd || undefined,
    sourceUrl: "https://are-flags-lowered.kvex.chatgpt.site",
    sourceSnapshotId: `test-snapshot-${simulatedToken}`,
    status: "published",
    createdAt: new Date().toISOString(),
    alertType: scenario.alertType,
    geographicScope: "statewide",
  };
  return {
    jurisdiction,
    usStatus: scenario.usStatus,
    stateStatus: scenario.stateStatus,
    socialText: createXPostDraft(order, order.createdAt, simulatedToken).text,
    simulatedShareUrl: jurisdictionUrl(order, simulatedToken),
    previewAlt: previewAltText(jurisdiction, scenario.usStatus, scenario.stateStatus),
    extraction,
    notes: ["Dry run only: no order, email, database record, social draft, snapshot, or X post was created.", "A real post receives a newly saved immutable share token at publication time."],
  };
}

export function scenarioFromExtraction(extraction: AfeExtraction) {
  if (extraction.geographicScope !== "statewide" || !extraction.stateCode || !extraction.effectiveStart) {
    throw new Error("This test console can create an X-card simulation only for statewide alerts with a start date.");
  }
  return {
    stateCode: extraction.stateCode,
    reason: extraction.reason,
    effectiveStart: extraction.effectiveStart,
    effectiveEnd: extraction.effectiveEnd || undefined,
    alertType: extraction.alertType === "correction" || extraction.alertType === "revision" ? "correction" as const : "new" as const,
    usStatus: extraction.flagTypes.includes("us") ? "half_mast" as const : "full_mast" as const,
    stateStatus: extraction.flagTypes.includes("state") ? "half_mast" as const : "full_mast" as const,
  } satisfies TestAlertScenario;
}
