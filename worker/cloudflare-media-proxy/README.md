# Cloudflare Media Service

This Worker is an optional remote `media` service for the `Split` deployment profile.

Endpoints:

- `POST /v1/preview`
- `POST /v1/translate`
- `POST /v1/gif`
- `GET /health`

The wire contract stays stable so `web` and `listener` do not need custom per-platform logic when deployed remotely.

## Responsibilities

- fetch and normalize preview data for X/Twitter, Pixiv, and Bluesky
- proxy text translation to a LibreTranslate-compatible API
- proxy GIF conversion requests to the Render GIF service
- keep provider-specific logic outside `web` and `listener`

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
- `GIF_API_BASE_URL`: optional GIF service base URL
- `GIF_API_TOKEN`: optional bearer token for the GIF service

## Deploy

```bash
cd worker/cloudflare-media-proxy
pnpm dlx wrangler deploy
```

## App Integration

Set these in `web` and `listener`:

- `MEDIA_MODE=remote`
- `MEDIA_SERVICE_BASE_URL=https://<your-worker-domain>`
- `MEDIA_SERVICE_TOKEN=<same as WORKER_AUTH_TOKEN>`

Legacy aliases still work for one deprecation cycle:

- `MEDIA_WORKER_BASE_URL`
- `MEDIA_WORKER_TOKEN`

## Smoke Test

Run the project-level smoke test against a live worker:

```bash
MEDIA_SERVICE_BASE_URL=https://<your-worker-domain> \
MEDIA_SERVICE_TOKEN=<worker-token> \
pnpm worker:smoke
```

Useful options:

- `--twitter-url <url>`
- `--pixiv-url <url>`
- `--bluesky-url <url>`
- `--translate-target <lang>`
- `--gif-media-url <url>`
