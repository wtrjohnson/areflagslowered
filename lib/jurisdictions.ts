import type { Jurisdiction } from "./types.ts";

export type JurisdictionDefinition = Jurisdiction & {
  stateCode: string;
  slug: string;
  timeZone: string;
  flagAsset: string;
};

const timeZones: Record<string, string> = {
  AK: "America/Anchorage", HI: "Pacific/Honolulu", AZ: "America/Phoenix",
  AS: "Pacific/Pago_Pago", GU: "Pacific/Guam", MP: "Pacific/Saipan", PR: "America/Puerto_Rico", VI: "America/St_Thomas",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  MT: "America/Denver", ID: "America/Boise", WY: "America/Denver", CO: "America/Denver", UT: "America/Denver", NM: "America/Denver",
  ND: "America/Chicago", SD: "America/Chicago", NE: "America/Chicago", KS: "America/Chicago", OK: "America/Chicago", TX: "America/Chicago",
  MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago", LA: "America/Chicago",
  WI: "America/Chicago", IL: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago", TN: "America/Chicago",
  IN: "America/Indiana/Indianapolis", KY: "America/Kentucky/Louisville", MI: "America/Detroit",
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const jurisdictionCatalog: JurisdictionDefinition[] = [
  ["al","Alabama","AL"],["ak","Alaska","AK"],["az","Arizona","AZ"],["ar","Arkansas","AR"],["ca","California","CA"],["co","Colorado","CO"],["ct","Connecticut","CT"],["de","Delaware","DE"],["fl","Florida","FL"],["ga","Georgia","GA"],["hi","Hawaii","HI"],["id","Idaho","ID"],["il","Illinois","IL"],["in","Indiana","IN"],["ia","Iowa","IA"],["ks","Kansas","KS"],["ky","Kentucky","KY"],["la","Louisiana","LA"],["me","Maine","ME"],["md","Maryland","MD"],["ma","Massachusetts","MA"],["mi","Michigan","MI"],["mn","Minnesota","MN"],["ms","Mississippi","MS"],["mo","Missouri","MO"],["mt","Montana","MT"],["ne","Nebraska","NE"],["nv","Nevada","NV"],["nh","New Hampshire","NH"],["nj","New Jersey","NJ"],["nm","New Mexico","NM"],["ny","New York","NY"],["nc","North Carolina","NC"],["nd","North Dakota","ND"],["oh","Ohio","OH"],["ok","Oklahoma","OK"],["or","Oregon","OR"],["pa","Pennsylvania","PA"],["ri","Rhode Island","RI"],["sc","South Carolina","SC"],["sd","South Dakota","SD"],["tn","Tennessee","TN"],["tx","Texas","TX"],["ut","Utah","UT"],["vt","Vermont","VT"],["va","Virginia","VA"],["wa","Washington","WA"],["wv","West Virginia","WV"],["wi","Wisconsin","WI"],["wy","Wyoming","WY"],
  ["dc","District of Columbia","DC"],["as","American Samoa","AS"],["gu","Guam","GU"],["mp","Northern Mariana Islands","MP"],["pr","Puerto Rico","PR"],["vi","U.S. Virgin Islands","VI"],
].map(([id, name, stateCode]) => ({
  id,
  name,
  stateCode,
  slug: slugify(name),
  timeZone: timeZones[stateCode] || "America/New_York",
  flagAsset: `/flags/${stateCode.toLowerCase()}.svg`,
  level: ["as", "gu", "mp", "pr", "vi"].includes(id) ? "territory" as const : "state" as const,
}));

export const reservedJurisdictionSlugs = new Set(["api", "admin"]);

export function jurisdictionBySlug(slug: string) {
  if (reservedJurisdictionSlugs.has(slug)) return undefined;
  return jurisdictionCatalog.find((jurisdiction) => jurisdiction.slug === slug);
}

export function jurisdictionByCode(code: string) {
  return jurisdictionCatalog.find((jurisdiction) => jurisdiction.stateCode.toLowerCase() === code.toLowerCase());
}

export const federalJurisdiction: Jurisdiction = { id: "us", name: "United States", level: "federal" };

export const allJurisdictions = [federalJurisdiction, ...jurisdictionCatalog];
