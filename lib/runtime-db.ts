import { getDb } from "../db/index.ts";

export async function getRuntimeDb() {
  let databaseUrl = process.env.DATABASE_URL;
  try {
    const { env } = await import("cloudflare:workers");
    databaseUrl = (env as { DATABASE_URL?: string }).DATABASE_URL || databaseUrl;
  } catch {
    // Local Node execution uses process.env.
  }
  return getDb(databaseUrl);
}
