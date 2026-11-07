# Cloudflare Workers deployment

This application is a full-stack Vinext application with server-rendered pages and API routes. Deploy it as a **Cloudflare Worker**, not as a static Cloudflare Pages project.

## Connect GitHub

1. In Cloudflare, open **Workers & Pages** and choose **Create application** > **Import a repository**.
2. Authorize GitHub and select `wtrjohnson/areflagslowered`.
3. Set the production branch to `main`.
4. Set the build command to `npm run build`.
5. Set the deploy command to `npx wrangler deploy`.
6. Save and deploy. Future pushes to `main` will deploy automatically; pull requests receive preview deployments.

The Worker name is configured as `areflagslowered` to match the Cloudflare Worker created during import.

## Environment variables

In **Worker** > **Settings** > **Environment variables**, add the production values below. Store the first group as **Secrets** and the second as plain **Variables**. Never commit their real values.

### Secrets

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `CLOUDMAILIN_SHARED_SECRET`
- `CLOUDMAILIN_WEBHOOK_TOKEN`
- `RESEND_API_KEY`
- `MONITORING_SCHEDULE_SECRET`
- `FEEDBACK_RATE_LIMIT_SALT`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`

### Variables

- `ARE_FLAGS_LOWERED_URL=https://areflagslowered.com`
- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `CLOUDMAILIN_ALLOW_LEGACY_URL_TOKEN=false`
- `AFE_OPERATOR_EMAILS`
- `AFE_SOURCE_URL=https://flagsexpress.com`
- `AFE_TRUSTED_FORWARDERS`
- `RESEND_FROM_EMAIL`
- `MONITORING_EMAIL`
- `FEEDBACK_RETENTION_DAYS=90`
- `X_ACCOUNT_HANDLE`
- `X_POSTING_ENABLED=false`

Copy the corresponding values from the current deployment. Values left blank in the current deployment can remain unset unless that integration is being used.

Production variables and secrets are intentionally managed in the Cloudflare dashboard. The Wrangler configuration uses `keep_vars` so GitHub deployments preserve them rather than overwriting or deleting dashboard-managed values.

## Domain and cutover

1. After the first Worker deployment works on its temporary `workers.dev` URL, add `areflagslowered.com` as the Worker custom domain.
2. Add `www.areflagslowered.com` too, then redirect it to `https://areflagslowered.com`.
3. Confirm the root page, `/montana`, `/api/status`, `/robots.txt`, and `/sitemap.xml` all work on the custom domain.
4. Change the CloudMailin webhook destination to `https://areflagslowered.com/api/ingest/cloudmailin/unused` and leave its HTTP Authorization header in place.
5. In the X developer portal, update the OAuth callback URL to `https://areflagslowered.com/api/integrations/x/callback`.
6. Only after those checks pass, remove the temporary Sites custom-domain deployment.

## Search launch

After the custom domain is live, verify the domain in Google Search Console and submit `https://areflagslowered.com/sitemap.xml`. Do not submit the temporary `kvex.chatgpt.site` sitemap.
