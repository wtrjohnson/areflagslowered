# Are Flags Lowered?

A local, text-first prototype for answering why flags are at half-mast and
whether the U.S. and state flags should be lowered today.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

The API uses Neon PostgreSQL. Set `DATABASE_URL` before running migrations or
the federal ingestion job. The public API is intentionally anonymous and
database-backed; it does not silently treat a missing database as a full-mast
answer.

## Included Prototype

- `lib/types.ts` defines orders, sources, answers, and social drafts.
- `lib/answer-engine.ts` resolves active orders by date, location, and flag type.
- `lib/ingestion.ts` normalizes source changes and flags ambiguous records.
- `lib/social.ts` creates reviewable, source-linked X drafts.
- `db/schema.ts` defines the relational/PostgreSQL storage shape.
- `app/api/status/route.ts` exposes the answer contract as JSON.
- The local data set intentionally contains no invented orders; it defaults to
  full mast until official records are ingested.

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build and verify the rendered status page
- `node --experimental-strip-types --test tests/domain.test.mjs`: verify answer
  resolution and X draft behavior
- `npm run db:generate`: generate PostgreSQL migrations after schema changes
- `npm run db:migrate`: apply migrations using `DATABASE_URL`
- `npm run db:seed:jurisdictions`: seed the 57-jurisdiction registry
- `npm run db:seed:sources`: seed the monitored official sources
- `npm run ingest:federal -- --limit=10`: fetch and persist new White House candidates
- `npm run ingest:federal -- --url=<proclamation-url> --force`: re-parse one source
- `npm run ingest:federal -- --url=<proclamation-url> --dry-run`: fetch and print normalized data without Neon or local writes

## API

The primary endpoint is `GET /api/status`:

```text
/api/status?location=New%20York%2C%20NY&state=NY
/api/status?location=New%20York%2C%20NY&state=NY&format=text
/api/status?all=true&format=text
```

Use `all=true` for a single text response containing every current federal,
state, and territorial U.S.-flag and state-flag status.

Without Neon, use the local Dolly fixture to exercise an active order:

```text
/api/status?location=New%20York%2C%20NY&state=NY&date=2026-08-28&demo=dolly&format=text
```

Demo data is available only in development and is labeled as such.

The API requires `DATABASE_URL`. When Neon is unavailable, it returns HTTP
503 with `status: "uncertain"`; it does not guess that flags are at full mast.

The federal ingestion workflow runs every 15 minutes after `DATABASE_URL` is
added as a GitHub Actions repository secret.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle PostgreSQL Guide](https://orm.drizzle.team/docs/get-started/postgresql-new)
