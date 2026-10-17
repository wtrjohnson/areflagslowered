import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { extractAfeEmail, summarizeAfeReason, validateAfeExtraction } from "../../../../lib/afe-extractor.ts";
import { parseInboundEmail } from "../../../../lib/afe-email.ts";
import { validateAfeSender } from "../../../../lib/afe-ingestion.ts";
import { createTestAlertResult, scenarioFromExtraction, type TestAlertScenario } from "../../../../lib/test-alert.ts";
import { publishTestXPost } from "../../../../lib/test-x-publishing.ts";
import { getDb } from "../../../../db/index.ts";

async function operatorAuthorized() {
  const email = (await headers()).get("oai-authenticated-user-email");
  const allowed = (process.env.AFE_OPERATOR_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function POST(request: Request) {
  if (!(await operatorAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const payload = await request.json() as { mode?: "scenario" | "email" | "publish_test"; scenario?: TestAlertScenario; rawEmail?: string; requestId?: string };
    if (payload.mode === "publish_test") {
      if (!payload.scenario || !payload.requestId) throw new Error("Test scenario and request ID are required.");
      return NextResponse.json(await publishTestXPost(getDb(), payload.scenario, payload.requestId));
    }
    if (payload.mode === "email") {
      if (!payload.rawEmail?.trim()) throw new Error("Paste an email first.");
      const email = parseInboundEmail(payload.rawEmail);
      if (!validateAfeSender(email)) throw new Error("The pasted message is not recognized as an American Flags Express alert.");
      const extraction = await extractAfeEmail(email);
      validateAfeExtraction(extraction);
      const reason = await summarizeAfeReason(extraction.reason, extraction.namedEntities);
      const scenario = scenarioFromExtraction({ ...extraction, reason });
      return NextResponse.json(createTestAlertResult(scenario, { ...extraction, reason }));
    }
    if (!payload.scenario) throw new Error("Test scenario is required.");
    return NextResponse.json(createTestAlertResult(payload.scenario));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Test alert could not be simulated." }, { status: 422 });
  }
}
