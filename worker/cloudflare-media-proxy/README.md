# Cloudflare Media Proxy Worker

This Worker provides two internal endpoints for the Next.js Discord bot:

- `POST /v1/preview`: returns normalized preview metadata.
- `POST /v1/download`: requests media URL from cobalt, then optional fallback API.

## Why this exists

- Keep heavy media logic outside Vercel Functions.
- Use "third-party first, self-built fallback" strategy.
- Keep Discord bot webhook lean and stable.

## Required env vars

- `COBALT_API_BASE_URL`

## Optional env vars

- `WORKER_AUTH_TOKEN`: Bearer token expected by this worker.
- `MEDIA_ALLOWED_DOMAINS`: comma-separated domain allowlist.
- `FALLBACK_API_BASE_URL`: fallback API endpoint (`/v1/download`).
- `FALLBACK_API_TOKEN`: Bearer token for fallback API.

## Deploy

```bash
cd worker/cloudflare-media-proxy
pnpm dlx wrangler deploy
```

## Next.js integration

Set these in the Next.js app:

- `MEDIA_WORKER_BASE_URL=https://<your-worker-domain>`
- `MEDIA_WORKER_TOKEN=<same as WORKER_AUTH_TOKEN>`

The `/download` command and media buttons will call this Worker.
