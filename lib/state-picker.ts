import type { Jurisdiction } from "./types.ts";

export type JurisdictionMenuStatus = "half_mast" | "full_mast" | "below_us" | "uncertain";
export type StateFilter = "all" | "full_mast" | "half_mast";

export function matchesStateFilter(status: JurisdictionMenuStatus | undefined, filter: StateFilter) {
  if (filter === "all") return true;
  if (filter === "full_mast") return status === "full_mast";
  return status === "half_mast" || status === "below_us";
}

export function matchesStateQuery(state: Jurisdiction, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return state.name.toLowerCase().includes(normalized) || state.stateCode?.toLowerCase().includes(normalized) === true;
}
