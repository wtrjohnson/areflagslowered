# Are Flags Lowered?

A local, text-first prototype for answering why flags are at half-mast and
whether the U.S. and state flags should be lowered today. Current public status
is sourced only from American Flags Express email alerts.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

The API uses Neon PostgreSQL. Set `DATABASE_URL` before running migrations.
CloudMailin posts American Flags Express alerts to `/api/ingest/email`; the
endpoint requires `CLOUDMAILIN_SHARED_SECRET` (or the tokenized CloudMailin
route's `CLOUDMAILIN_WEBHOOK_TOKEN`), calls the Anthropic Messages API,
and stores validated national/state orders. County alerts are retained for
review but do not affect public state-level status.

## Included Prototype

- `lib/types.ts` defines orders, sources, answers, and social drafts.
- `lib/answer-engine.ts` resolves active orders by date, location, and flag type.
- `lib/afe-email.ts` parses inbound multipart email and quoted-printable content.
- `lib/afe-extractor.ts` defines the strict Anthropic tool-use extraction contract.
- `lib/afe-ingestion.ts` validates, deduplicates, quarantines, and persists AFE alerts.
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
- `npm run test:afe`: verify the American Flags Express email fixture and extraction validation
- `npm run db:seed:sources`: seed AFE as the only enabled source and disable legacy sources
- `npm run afe:cutover`: explicitly remove legacy active data while preserving AFE records

## API

The primary endpoint is `GET /api/status`:

```text
/api/status?location=New%20York%2C%20NY&state=NY
/api/status?location=New%20York%2C%20NY&state=NY&format=text
/api/status?all=true&format=text
/api/coverage
/api/coverage?format=text
```

Use `all=true` for a single text response containing every current federal,
state, and territorial U.S.-flag and state-flag status.

Use `/api/coverage` for source-health reporting: freshness, failures, latency,
current-status counts, and open conflicts.

Without Neon, use the local Dolly fixture to exercise an active order:

```text
/api/status?location=New%20York%2C%20NY&state=NY&date=2026-08-28&demo=dolly&format=text
```

Demo data is available only in development and is labeled as such.

The API requires `DATABASE_URL`. When Neon is unavailable, it returns HTTP
503 with `status: "uncertain"`; it does not guess that flags are at full mast.

Legacy federal/state ingestion scripts remain in the repository for reference,
but are inactive and must not be scheduled. Status is resolved dynamically from
published AFE orders, including their effective dates and ending conditions.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle PostgreSQL Guide](https://orm.drizzle.team/docs/get-started/postgresql-new)
