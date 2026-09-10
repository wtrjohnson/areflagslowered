export type MonitoredSource = {
  id: string;
  jurisdictionId: string;
  name: string;
  url: string;
  sourceType: "status_page" | "archive" | "directives" | "newsroom";
  parserName: string;
  priority: "primary" | "secondary" | "fallback";
  timeZone: string;
  pollIntervalMinutes: number;
};

// First representative set from the V1 build sequence. Exact URLs are kept in
// code so source changes are reviewable and do not become hidden configuration.
export const monitoredSources: MonitoredSource[] = [
  { id: "az-half-staff", jurisdictionId: "az", name: "Arizona Half Staff Notifications", url: "https://az.gov/half-staff-notices", sourceType: "status_page", parserName: "arizona_half_staff", priority: "primary", timeZone: "America/Phoenix", pollIntervalMinutes: 30 },
  { id: "fl-flag-information", jurisdictionId: "fl", name: "Florida Flag Information", url: "https://flgov.com/eog/info/flag-information", sourceType: "archive", parserName: "florida_flag_information", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "il-flag-honors", jurisdictionId: "il", name: "Illinois Flag Honors", url: "https://www.illinois.gov/about/flag-honors.html", sourceType: "archive", parserName: "illinois_flag_honors", priority: "primary", timeZone: "America/Chicago", pollIntervalMinutes: 30 },
  { id: "ma-flag-status", jurisdictionId: "ma", name: "Massachusetts Flag Status", url: "https://www.mass.gov/info-details/flag-status", sourceType: "status_page", parserName: "massachusetts_flag_status", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "nc-flags", jurisdictionId: "nc", name: "North Carolina Flying Flags", url: "https://www.doa.nc.gov/about/flags", sourceType: "archive", parserName: "north_carolina_flag_alerts", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "nj-flag-status", jurisdictionId: "nj", name: "New Jersey Flag Status", url: "https://www.nj.gov/state/dos-flag-status.shtml", sourceType: "status_page", parserName: "new_jersey_flag_status", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "ok-flag-status", jurisdictionId: "ok", name: "Oklahoma Flag Status", url: "https://oklahoma.gov/governor.html", sourceType: "status_page", parserName: "oklahoma_flag_status", priority: "primary", timeZone: "America/Chicago", pollIntervalMinutes: 30 },
  { id: "ny-flags-state-buildings", jurisdictionId: "ny", name: "New York Flags on State Buildings", url: "https://ogs.ny.gov/node/5016", sourceType: "newsroom", parserName: "new_york_flag_status", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "pa-flag-notices", jurisdictionId: "pa", name: "Pennsylvania Flag Notices", url: "https://www.pa.gov/agencies/dgs/flag-notices", sourceType: "status_page", parserName: "pennsylvania_flag_notices", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 30 },
  { id: "tx-flag-status", jurisdictionId: "tx", name: "Texas Flag Status", url: "https://gov.texas.gov/flag-status", sourceType: "status_page", parserName: "texas_flag_status", priority: "primary", timeZone: "America/Chicago", pollIntervalMinutes: 30 },
  { id: "wa-flag-lowering", jurisdictionId: "wa", name: "Washington Flag Lowering and Display", url: "https://governor.wa.gov/official-actions/flag-lowering-and-display", sourceType: "directives", parserName: "washington_flag_directives", priority: "primary", timeZone: "America/Los_Angeles", pollIntervalMinutes: 30 },
];
