import { getDb } from "../db/index.ts";
import { refreshCurrentStatuses } from "../db/status.ts";

const now = new Date();
const date = process.argv.find((arg) => arg.startsWith("--date="))?.slice(7) || now.toISOString().slice(0, 10);
await refreshCurrentStatuses(getDb(), date, now);
console.log(JSON.stringify({ status: "refreshed", date, checkedAt: now.toISOString() }));
