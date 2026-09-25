export type FlagType = "us" | "state";
export type OrderStatus = "published" | "needs_review" | "rejected";

export type Jurisdiction = {
  id: string;
  name: string;
  stateCode?: string;
  level: "federal" | "state" | "territory";
};

export type SourceSnapshot = {
  id: string;
  sourceId: string;
  url: string;
  retrievedAt: string;
  contentHash: string;
  content: string;
  parserStatus: "parsed" | "changed" | "failed";
};

export type HalfMastOrder = {
  id: string;
  title: string;
  reason: string;
  issuingAuthority: string;
  jurisdiction: Jurisdiction;
  flagTypes: FlagType[];
  scope: "nationwide" | "statewide";
  instructionType: "order" | "request" | "unknown";
  instructionText: string;
  effectiveStart: string;
  effectiveStartTime?: string;
  effectiveEnd?: string;
  effectiveEndTime?: string;
  effectiveEndCondition?: string;
  timeZone?: string;
  sourceUrl: string;
  sourceSnapshotId: string;
  status: OrderStatus;
  alertType?: "new" | "correction" | "cancellation" | "revision";
  geographicScope?: "nationwide" | "statewide" | "county" | "unknown";
  countyName?: string;
  sourceMessageId?: string;
  createdAt: string;
};

export type FlagResult = {
  flagType: FlagType;
  label: string;
  status: "half_mast" | "full_mast" | "below_us" | "uncertain";
  explanation: string;
  orders: HalfMastOrder[];
};

export type StatusAnswer = {
  status: "half_mast" | "full_mast" | "uncertain";
  location: string;
  date: string;
  flagResults: FlagResult[];
  applicableOrders: HalfMastOrder[];
  sourceLinks: string[];
  lastCheckedAt: string;
  coverageNotice: string;
};

export type SocialDraft = {
  id: string;
  orderId: string;
  text: string;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
};
