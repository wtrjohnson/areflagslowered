import type { StatusAnswer } from "./types.ts";

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
        `When: ${formatDate(order.effectiveStart)} through ${order.effectiveEnd ? `${formatDate(order.effectiveEnd)}${order.effectiveEndTime ? ` at ${order.effectiveEndTime}` : order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : ""}` : "further notice"}`,
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
