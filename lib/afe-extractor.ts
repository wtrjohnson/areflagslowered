import type { InboundEmail } from "./afe-email.ts";
import { emailText } from "./afe-email.ts";

export type AfeExtraction = {
  alertType: "new" | "correction" | "cancellation" | "revision";
  flagTypes: Array<"us" | "state">;
  stateName: string | null;
  stateCode: string | null;
  geographicScope: "nationwide" | "statewide" | "county" | "municipal" | "unknown";
  countyName: string | null;
  localityName: string | null;
  title: string;
  reason: string;
  namedEntities: string[];
  issuingAuthority: string;
  effectiveStart: string | null;
  effectiveStartTime: string | null;
  effectiveEnd: string | null;
  effectiveEndTime: string | null;
  effectiveEndCondition: string | null;
  timeZone: string | null;
  instructionText: string;
  externalId: string | null;
};

export const afeExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["alertType", "flagTypes", "stateName", "stateCode", "geographicScope", "countyName", "localityName", "title", "reason", "namedEntities", "issuingAuthority", "effectiveStart", "effectiveStartTime", "effectiveEnd", "effectiveEndTime", "effectiveEndCondition", "timeZone", "instructionText", "externalId"],
  properties: {
    alertType: { type: "string", enum: ["new", "correction", "cancellation", "revision"] },
    flagTypes: { type: "array", items: { type: "string", enum: ["us", "state"] } },
    stateName: { type: ["string", "null"] }, stateCode: { type: ["string", "null"] },
    geographicScope: { type: "string", enum: ["nationwide", "statewide", "county", "municipal", "unknown"] },
    countyName: { type: ["string", "null"] }, localityName: { type: ["string", "null"] }, title: { type: "string" }, reason: { type: "string" },
    namedEntities: { type: "array", items: { type: "string" } },
    issuingAuthority: { type: "string" }, effectiveStart: { type: ["string", "null"] }, effectiveStartTime: { type: ["string", "null"] },
    effectiveEnd: { type: ["string", "null"] }, effectiveEndTime: { type: ["string", "null"] }, effectiveEndCondition: { type: ["string", "null"] },
    timeZone: { type: ["string", "null"] }, instructionText: { type: "string" }, externalId: { type: ["string", "null"] },
  },
} as const;

export async function extractAfeEmail(email: InboundEmail, apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"): Promise<AfeExtraction> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      max_tokens: 2048,
      model,
      system: "Extract only facts explicitly present in this American Flags Express alert. The actual instruction body and any proclamation determine scope; a marketing-style email heading must not broaden it. A city/town/village-only direction is municipal, and the city/town/village goes in localityName. Do not infer missing dates, scope, authority, or affected flags. Return null when a field is not stated. Use ISO dates only when the email states an unambiguous date. For cancellations, effectiveStart may be null when not stated. In namedEntities, list every explicitly named person and named organization mentioned in the reason text, using each name exactly as written without titles or role descriptions; use an empty array when none are named.",
      tools: [{ name: "extract_american_flags_express_alert", description: "Return the normalized facts explicitly present in the alert email.", strict: true, input_schema: afeExtractionSchema }],
      tool_choice: { type: "tool", name: "extract_american_flags_express_alert" },
      messages: [{ role: "user", content: emailText(email) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic extraction failed with HTTP ${response.status}.`);
  const payload = await response.json() as { content?: Array<{ type?: string; input?: AfeExtraction }> };
  const toolUse = payload.content?.find((item) => item.type === "tool_use" && item.input);
  if (!toolUse?.input) throw new Error("Anthropic extraction returned no structured tool output.");
  return toolUse.input;
}

/**
 * The extraction step deliberately preserves the source wording. This separate
 * step creates the short, public-facing explanation shown on the site.
 */
export async function summarizeAfeReason(reason: string, namedEntities: string[] = [], apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6") {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      max_tokens: 120,
      model,
      system: "Write one neutral, plain-language sentence (30 words or fewer) that summarizes the stated reason for lowering flags. Use only the supplied source text. Do not add facts, dates, locations, or honorifics that are not stated. Every name in the required names list must appear verbatim in the sentence. Return only the sentence.",
      messages: [{ role: "user", content: `Reason: ${reason}\nRequired names: ${namedEntities.join("; ") || "None"}` }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic reason summary failed with HTTP ${response.status}.`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const summary = payload.content?.find((item) => item.type === "text")?.text?.replace(/\s+/g, " ").trim();
  if (!summary) throw new Error("Anthropic reason summary returned no text.");
  const cleaned = summary.replace(/^['\"]|['\"]$/g, "");
  const missingNames = namedEntities.filter((name) => name && !cleaned.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  if (missingNames.length) {
    // The source wording is preferable to rejecting an otherwise valid alert
    // when a summarization model drops a required name.
    const sourceWording = reason.replace(/\s+/g, " ").trim();
    const missingFromSource = namedEntities.filter((name) => name && !sourceWording.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
    if (!missingFromSource.length) return sourceWording;
    throw new Error(`Reason summary omitted required names: ${missingNames.join(", ")}.`);
  }
  return cleaned;
}

export function validateAfeExtraction(value: AfeExtraction) {
  if (!value || !["new", "correction", "cancellation", "revision"].includes(value.alertType)) throw new Error("Invalid alert type.");
  if (!value.flagTypes?.length || value.flagTypes.some((flag) => !["us", "state"].includes(flag))) throw new Error("At least one valid flag type is required.");
  const validIsoDate = (date: string | null) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  };
  if (value.effectiveStart && !validIsoDate(value.effectiveStart)) throw new Error("Effective start must be an exact ISO date.");
  if (value.effectiveEnd && !validIsoDate(value.effectiveEnd)) throw new Error("Effective end must be an exact ISO date.");
  if (value.alertType !== "cancellation" && !value.effectiveStart) throw new Error("An ISO effective start date is required.");
  if (!value.reason || !value.issuingAuthority || !value.instructionText) throw new Error("Reason, authority, and original instruction text are required.");
  if (!Array.isArray(value.namedEntities) || value.namedEntities.some((name) => !name.trim())) throw new Error("Named entities must be a list of non-empty names.");
  if (value.geographicScope === "statewide" && !value.stateCode) throw new Error("Statewide orders require a state code.");
  if (value.geographicScope === "county" && (!value.stateCode || !value.countyName)) throw new Error("County orders require a state and county.");
  if (value.geographicScope === "municipal" && (!value.stateCode || !value.localityName)) throw new Error("Municipal orders require a state and locality.");
  if (value.timeZone) {
    try { Intl.DateTimeFormat(undefined, { timeZone: value.timeZone }); } catch { throw new Error("A valid IANA time zone is required."); }
  }
}
