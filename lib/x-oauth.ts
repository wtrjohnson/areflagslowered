import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { xOAuthConnections } from "../db/schema.ts";

const CONNECTION_ID = "areflagslowered";
const X_ACCOUNT_HANDLE = (process.env.X_ACCOUNT_HANDLE || "@areflagslowered").replace(/^@/, "").toLowerCase();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Database = ReturnType<typeof getDb>;
type XTokens = { accessToken: string; refreshToken: string; expiresAt: string };
type XTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asUrlSafeBase64(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomUrlSafeValue() {
  return asUrlSafeBase64(crypto.getRandomValues(new Uint8Array(32)));
}

async function tokenEncryptionKey() {
  const secret = process.env.X_CLIENT_SECRET;
  if (!secret) throw new Error("X_CLIENT_SECRET is not configured.");
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`are-flags-lowered/x-oauth/v1/${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptTokens(tokens: XTokens) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenEncryptionKey(), encoder.encode(JSON.stringify(tokens)));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptTokens(value: string): Promise<XTokens> {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Stored X authorization is malformed.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await tokenEncryptionKey(), fromBase64(encrypted));
  const tokens = JSON.parse(decoder.decode(plaintext)) as XTokens;
  if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) throw new Error("Stored X authorization is incomplete.");
  return tokens;
}

async function ensureStorage(db: Database) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "x_oauth_connections" (
      "id" text PRIMARY KEY NOT NULL,
      "account_handle" text NOT NULL,
      "encrypted_tokens" text NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
}

function callbackUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/integrations/x/callback`;
}

function clientCredentials() {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("X OAuth client credentials are not configured.");
  return { clientId, clientSecret };
}

function responseError(payload: XTokenResponse, fallback: string) {
  return payload.error_description || payload.error || fallback;
}

async function requestXTokens(parameters: URLSearchParams): Promise<XTokenResponse> {
  const { clientId, clientSecret } = clientCredentials();
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: parameters,
  });
  const payload = await response.json().catch(() => ({})) as XTokenResponse;
  if (!response.ok) throw new Error(responseError(payload, `X token exchange returned ${response.status}.`));
  return payload;
}

function toStoredTokens(payload: XTokenResponse, existingRefreshToken?: string): XTokens {
  if (!payload.access_token) throw new Error(responseError(payload, "X did not return an access token."));
  const refreshToken = payload.refresh_token || existingRefreshToken;
  if (!refreshToken) throw new Error("X did not return a refresh token. Reconnect with offline.access enabled.");
  return {
    accessToken: payload.access_token,
    refreshToken,
    expiresAt: new Date(Date.now() + (payload.expires_in || 7200) * 1000).toISOString(),
  };
}

async function saveConnection(db: Database, tokens: XTokens) {
  await ensureStorage(db);
  await db.insert(xOAuthConnections).values({
    id: CONNECTION_ID,
    accountHandle: X_ACCOUNT_HANDLE,
    encryptedTokens: await encryptTokens(tokens),
    expiresAt: new Date(tokens.expiresAt),
  }).onConflictDoUpdate({
    target: xOAuthConnections.id,
    set: { accountHandle: X_ACCOUNT_HANDLE, encryptedTokens: await encryptTokens(tokens), expiresAt: new Date(tokens.expiresAt), updatedAt: new Date() },
  });
}

async function getConnection(db: Database) {
  await ensureStorage(db);
  return (await db.select().from(xOAuthConnections).where(eq(xOAuthConnections.id, CONNECTION_ID)))[0];
}

export async function createXAuthorizationUrl(origin: string) {
  const { clientId } = clientCredentials();
  const state = randomUrlSafeValue();
  const verifier = randomUrlSafeValue();
  const challenge = asUrlSafeBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl(origin),
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { state, verifier, url: url.toString() };
}

async function xUsername(accessToken: string) {
  const response = await fetch("https://api.x.com/2/users/me", { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({})) as { data?: { username?: string }; detail?: string };
  if (!response.ok || !payload.data?.username) throw new Error(payload.detail || "X could not identify the authorized account.");
  return payload.data.username.toLowerCase();
}

export async function completeXAuthorization(origin: string, code: string, verifier: string) {
  const { clientId } = clientCredentials();
  const payload = await requestXTokens(new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callbackUrl(origin),
    code_verifier: verifier,
  }));
  const tokens = toStoredTokens(payload);
  const username = await xUsername(tokens.accessToken);
  if (username !== X_ACCOUNT_HANDLE) throw new Error(`Authorize @${X_ACCOUNT_HANDLE}; @${username} cannot be connected to this publisher.`);
  await saveConnection(getDb(), tokens);
  return `@${username}`;
}

export async function getXAccessToken(db: Database) {
  const connection = await getConnection(db);
  if (!connection) return undefined;
  const tokens = await decryptTokens(connection.encryptedTokens);
  if (Date.parse(tokens.expiresAt) > Date.now() + 60_000) return tokens.accessToken;
  const { clientId } = clientCredentials();
  const refreshed = toStoredTokens(await requestXTokens(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  })), tokens.refreshToken);
  await saveConnection(db, refreshed);
  return refreshed.accessToken;
}
