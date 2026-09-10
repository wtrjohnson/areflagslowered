import type { Jurisdiction } from "./types.ts";

export const jurisdictionCatalog: Jurisdiction[] = [
  ["al","Alabama","AL"],["ak","Alaska","AK"],["az","Arizona","AZ"],["ar","Arkansas","AR"],["ca","California","CA"],["co","Colorado","CO"],["ct","Connecticut","CT"],["de","Delaware","DE"],["fl","Florida","FL"],["ga","Georgia","GA"],["hi","Hawaii","HI"],["id","Idaho","ID"],["il","Illinois","IL"],["in","Indiana","IN"],["ia","Iowa","IA"],["ks","Kansas","KS"],["ky","Kentucky","KY"],["la","Louisiana","LA"],["me","Maine","ME"],["md","Maryland","MD"],["ma","Massachusetts","MA"],["mi","Michigan","MI"],["mn","Minnesota","MN"],["ms","Mississippi","MS"],["mo","Missouri","MO"],["mt","Montana","MT"],["ne","Nebraska","NE"],["nv","Nevada","NV"],["nh","New Hampshire","NH"],["nj","New Jersey","NJ"],["nm","New Mexico","NM"],["ny","New York","NY"],["nc","North Carolina","NC"],["nd","North Dakota","ND"],["oh","Ohio","OH"],["ok","Oklahoma","OK"],["or","Oregon","OR"],["pa","Pennsylvania","PA"],["ri","Rhode Island","RI"],["sc","South Carolina","SC"],["sd","South Dakota","SD"],["tn","Tennessee","TN"],["tx","Texas","TX"],["ut","Utah","UT"],["vt","Vermont","VT"],["va","Virginia","VA"],["wa","Washington","WA"],["wv","West Virginia","WV"],["wi","Wisconsin","WI"],["wy","Wyoming","WY"],
  ["dc","District of Columbia","DC"],["as","American Samoa","AS"],["gu","Guam","GU"],["mp","Northern Mariana Islands","MP"],["pr","Puerto Rico","PR"],["vi","U.S. Virgin Islands","VI"],
].map(([id, name, stateCode]) => ({ id, name, stateCode, level: ["as", "gu", "mp", "pr", "vi"].includes(id) ? "territory" as const : "state" as const }));

export const federalJurisdiction: Jurisdiction = { id: "us", name: "United States", level: "federal" };

export const allJurisdictions = [federalJurisdiction, ...jurisdictionCatalog];
