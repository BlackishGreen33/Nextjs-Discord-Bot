# Cloudflare Media Proxy Worker

This Worker is the preview center for the Discord bot.

Endpoints:

- `POST /v1/preview`
- `POST /v1/translate`
- `POST /v1/gif`
- `GET /health`

## Responsibilities

- fetch and normalize preview data for X/Twitter, Pixiv, and Bluesky
- proxy text translation to a LibreTranslate-compatible API
- proxy GIF conversion requests to the Render GIF service
- keep heavy provider logic outside the Next.js interaction webhook

## Environment Variables

Required for secured deployments:

- `WORKER_AUTH_TOKEN`: bearer token expected by the worker

Optional provider configuration:

- `MEDIA_ALLOWED_DOMAINS`: comma-separated URL allowlist
- `FXEMBED_PUBLIC_BASE_URL`: default `https://api.fxtwitter.com`
- `FXEMBED_FALLBACK_BASE_URL`: optional alternate FxEmbed-compatible base URL
- `PHIXIV_PUBLIC_BASE_URL`: default `https://phixiv.net`
- `PHIXIV_FALLBACK_BASE_URL`: optional alternate phixiv-compatible base URL
- `BLUESKY_PUBLIC_BASE_URL`: default `https://public.api.bsky.app/xrpc`
- `BLUESKY_FALLBACK_BASE_URL`: optional alternate Bluesky API base URL
- `TRANSLATE_API_BASE_URL`: LibreTranslate-compatible API base URL
- `TRANSLATE_API_KEY`: optional translate API key
- `GIF_API_BASE_URL`: GIF service base URL
- `GIF_API_TOKEN`: bearer token for the GIF service

## Deploy

```bash
cd worker/cloudflare-media-proxy
pnpm dlx wrangler deploy
```

## Next.js Integration

Set these in the Next.js app:

- `MEDIA_WORKER_BASE_URL=https://<your-worker-domain>`
- `MEDIA_WORKER_TOKEN=<same as WORKER_AUTH_TOKEN>`

## Smoke Test

Run the project-level smoke test against a live worker:

```bash
MEDIA_WORKER_BASE_URL=https://<your-worker-domain> \
MEDIA_WORKER_TOKEN=<worker-token> \
pnpm worker:smoke
```

Useful options:

- `--twitter-url <url>`
- `--pixiv-url <url>`
- `--bluesky-url <url>`
- `--translate-target <lang>`
- `--gif-media-url <url>`
