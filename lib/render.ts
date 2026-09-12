import type { StatusAnswer } from "./types.ts";

type AllStatusRow = {
  status: { jurisdictionId: string; flagType: "us" | "state"; status: "half_mast" | "full_mast" | "below_us" | "uncertain"; sourceUrl: string | null; checkedAt: Date | string };
  jurisdiction: { id: string; name: string; stateCode: string | null; level: "federal" | "state" | "territory" };
};

function statusLabel(value: AllStatusRow["status"]["status"]) {
  return value === "half_mast" ? "HALF-MAST [ACTIVE]" : value === "full_mast" ? "FULL MAST [INACTIVE]" : value === "below_us" ? "BELOW U.S. FLAG [BELOW U.S.]" : "UNCERTAIN [REVIEW]";
}

export function renderAllStatusesText(rows: AllStatusRow[], checkedAt = new Date().toISOString()) {
  const grouped = new Map<string, { jurisdiction: AllStatusRow["jurisdiction"]; statuses: Map<string, AllStatusRow["status"]> }>();
  for (const row of rows) {
    const group = grouped.get(row.jurisdiction.id) || { jurisdiction: row.jurisdiction, statuses: new Map() };
    group.statuses.set(row.status.flagType, row.status);
    grouped.set(row.jurisdiction.id, group);
  }
  const ordered = [...grouped.values()].sort((a, b) => a.jurisdiction.level === "federal" ? -1 : b.jurisdiction.level === "federal" ? 1 : a.jurisdiction.name.localeCompare(b.jurisdiction.name));
  const lines = ["ALL CURRENT FLAG STATUSES", "", ...ordered.map(({ jurisdiction, statuses }) => {
    const code = jurisdiction.stateCode ? ` (${jurisdiction.stateCode})` : "";
    return `${jurisdiction.name}${code}: U.S. flag ${statusLabel(statuses.get("us")?.status || "uncertain")} | State flag ${statusLabel(statuses.get("state")?.status || "uncertain")}`;
  }), "", `Data checked: ${checkedAt}`, "Coverage: Coverage currently includes official U.S. federal and state/territorial orders. City, county, facility, institutional, and private-flag orders may differ."];
  return lines.join("\n");
}

export function renderStatusText(answer: StatusAnswer) {
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const lines = [
    answer.status === "half_mast"
      ? `YES: flags should be at half-mast in ${answer.location} on ${answer.date}.`
      : answer.status === "full_mast"
        ? `NO: flags should be at full mast in ${answer.location} on ${answer.date}.`
        : `UNCERTAIN: the flag status for ${answer.location} on ${answer.date} needs review.`,
    "",
    ...answer.flagResults.flatMap((result) => {
      const status = result.status === "half_mast" ? "HALF-MAST" : result.status === "full_mast" ? "FULL MAST" : result.status === "below_us" ? "BELOW U.S. FLAG" : "UNCERTAIN";
      const indicator = result.status === "half_mast" ? "ACTIVE" : result.status === "full_mast" ? "INACTIVE" : result.status === "below_us" ? "BELOW U.S." : "REVIEW";
      const details = result.orders.flatMap((order) => [
        `Why: ${order.reason}`,
        `Where: ${order.scope === "nationwide" ? "Nationwide" : order.jurisdiction.name}`,
        `When: ${formatDate(order.effectiveStart)}${order.effectiveStartTime ? ` at ${order.effectiveStartTime}` : ""} through ${order.effectiveEnd ? `${formatDate(order.effectiveEnd)}${order.effectiveEndTime ? ` at ${order.effectiveEndTime}` : order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : ""}` : "further notice"}`,
        `Authority: ${order.issuingAuthority}`,
        `Source: ${order.sourceUrl}`,
      ]);
      return [`${result.label}: ${status} [${indicator}]`, ...(details.length ? details : [result.explanation]), ""];
    }),
    `Data checked: ${answer.lastCheckedAt}`,
    `Coverage: ${answer.coverageNotice}`,
  ];
  return lines.join("\n");
}
