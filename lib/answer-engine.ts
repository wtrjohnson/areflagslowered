import { orders as defaultOrders } from "./data.ts";
import type { FlagResult, FlagType, HalfMastOrder, StatusAnswer } from "./types.ts";

const coverageNotice =
  "Coverage currently includes official U.S. federal and state/territorial orders. City, county, facility, institutional, and private-flag orders may differ.";

function isActive(order: HalfMastOrder, date: string) {
  return (
    order.status === "published" &&
    order.effectiveStart <= date &&
    (!order.effectiveEnd || order.effectiveEnd >= date)
  );
}

function isActiveAt(order: HalfMastOrder, date: string, time?: string) {
  if (!isActive(order, date) || !time || !order.effectiveEndTime || date !== order.effectiveEnd) return isActive(order, date);
  return time < order.effectiveEndTime;
}

function appliesToState(order: HalfMastOrder, stateCode?: string) {
  return order.scope === "nationwide" || order.jurisdiction.stateCode === stateCode;
}

export function answerStatus({
  location,
  stateCode,
  date,
  flagTypes = ["us", "state"],
  checkedAt = new Date().toISOString(),
  orderRecords = defaultOrders,
  time,
  currentStatuses,
}: {
  location: string;
  stateCode?: string;
  date: string;
  flagTypes?: FlagType[];
  checkedAt?: string;
  orderRecords?: HalfMastOrder[];
  time?: string;
  currentStatuses?: Array<{ flagType: FlagType; status: FlagResult["status"]; orderIds?: string[]; sourceUrl?: string | null; checkedAt?: string | Date | null }>;
}): StatusAnswer {
  const applicableOrders = orderRecords.filter(
    (order) =>
      isActiveAt(order, date, time) &&
      appliesToState(order, stateCode) &&
      order.flagTypes.some((flagType) => flagTypes.includes(flagType)),
  );

  const flagResults = flagTypes.map((flagType) => {
    const matchingOrders = applicableOrders.filter((order) =>
      order.flagTypes.includes(flagType),
    );
    const label = flagType === "us" ? "U.S. flag" : "State flag";
    const halfMast = matchingOrders.length > 0;
    const federalHalfMast = flagType === "state" && applicableOrders.some((order) => order.flagTypes.includes("us"));
    const storedStatus = currentStatuses?.find((status) => status.flagType === flagType)?.status;
    const resolvedStatus = storedStatus || (halfMast ? "half_mast" : federalHalfMast ? "below_us" : "full_mast");
    return {
      flagType,
      label,
      status: resolvedStatus,
      explanation: resolvedStatus === "half_mast"
        ? matchingOrders.map((order) => order.reason).join(" ") || "The official jurisdiction source reports that flags are at half-mast."
        : resolvedStatus === "below_us" || federalHalfMast
          ? "No separate state order found. If displayed with the U.S. flag, this flag must remain below the U.S. flag."
        : currentStatuses?.some((status) => status.flagType === flagType)
          ? "The official jurisdiction source reports that this flag is at full mast."
          : "No current official order found; this flag should be displayed at full mast.",
      orders: matchingOrders,
    };
  });

  const statuses = flagResults.map((result) => result.status);
  const status = statuses.includes("half_mast")
    ? "half_mast"
    : statuses.every((value) => value === "full_mast" || value === "below_us")
      ? "full_mast"
      : "uncertain";

  return {
    status,
    location,
    date,
    flagResults,
    applicableOrders,
    sourceLinks: [...new Set([...applicableOrders.map((order) => order.sourceUrl), ...(currentStatuses || []).map((status) => status.sourceUrl).filter((url): url is string => Boolean(url))])],
    lastCheckedAt: currentStatuses?.map((status) => status.checkedAt).filter(Boolean).map((value) => value instanceof Date ? value.toISOString() : value as string).sort().at(-1) || checkedAt,
    coverageNotice,
  };
}
