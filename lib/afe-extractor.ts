import type { InboundEmail } from "./afe-email.ts";
import { emailText } from "./afe-email.ts";

export type AfeExtraction = {
  alertType: "new" | "correction" | "cancellation" | "revision";
  flagTypes: Array<"us" | "state">;
  stateName: string | null;
  stateCode: string | null;
  geographicScope: "nationwide" | "statewide" | "county" | "unknown";
  countyName: string | null;
  title: string;
  reason: string;
  issuingAuthority: string;
  effectiveStart: string;
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
  required: ["alertType", "flagTypes", "stateName", "stateCode", "geographicScope", "countyName", "title", "reason", "issuingAuthority", "effectiveStart", "effectiveStartTime", "effectiveEnd", "effectiveEndTime", "effectiveEndCondition", "timeZone", "instructionText", "externalId"],
  properties: {
    alertType: { type: "string", enum: ["new", "correction", "cancellation", "revision"] },
    flagTypes: { type: "array", items: { type: "string", enum: ["us", "state"] } },
    stateName: { type: ["string", "null"] }, stateCode: { type: ["string", "null"] },
    geographicScope: { type: "string", enum: ["nationwide", "statewide", "county", "unknown"] },
    countyName: { type: ["string", "null"] }, title: { type: "string" }, reason: { type: "string" },
    issuingAuthority: { type: "string" }, effectiveStart: { type: "string" }, effectiveStartTime: { type: ["string", "null"] },
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
      system: "Extract only facts explicitly present in this American Flags Express alert. Do not infer missing dates, scope, authority, or affected flags. Return null when a field is not stated. Use ISO dates only when the email states an unambiguous date.",
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

export function validateAfeExtraction(value: AfeExtraction) {
  if (!value || !["new", "correction", "cancellation", "revision"].includes(value.alertType)) throw new Error("Invalid alert type.");
  if (!value.flagTypes?.length || value.flagTypes.some((flag) => !["us", "state"].includes(flag))) throw new Error("At least one valid flag type is required.");
  if (!value.effectiveStart || !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveStart)) throw new Error("An ISO effective start date is required.");
  if (!value.reason || !value.issuingAuthority || !value.instructionText) throw new Error("Reason, authority, and original instruction text are required.");
  if (value.geographicScope === "statewide" && !value.stateCode) throw new Error("Statewide orders require a state code.");
  if (value.geographicScope === "county" && (!value.stateCode || !value.countyName)) throw new Error("County orders require a state and county.");
}
