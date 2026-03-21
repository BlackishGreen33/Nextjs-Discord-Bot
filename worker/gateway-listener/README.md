# Discord Gateway Listener

This service owns `MESSAGE_CREATE` auto preview replies for X / Twitter, Pixiv, and Bluesky links.

## Why This Exists

The `web` app handles slash commands and interaction callbacks. Auto preview requires a separate always-on Discord Gateway connection, so the listener is its own runtime role.

## Deployment Role

In the recommended `Render Standard` profile, this process runs as:

- `discord-bot-listener`
- Render Web Service
- health check path: `/healthz`

Keep exactly one healthy production listener instance at a time.

## Required Environment Variables

- `BOT_TOKEN` or `DISCORD_GATEWAY_TOKEN`
- `STORAGE_DRIVER=prisma|redis`

Also set one storage backend:

- Prisma default: `DATABASE_URL`
- Redis adapter: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Optional Environment Variables

- `REDIS_NAMESPACE`
- `MEDIA_MODE=embedded|remote|disabled`
- `MEDIA_SERVICE_BASE_URL`
- `MEDIA_SERVICE_TOKEN`
- `TRANSLATE_PROVIDER=disabled|libretranslate`
- `TRANSLATE_API_BASE_URL`
- `TRANSLATE_API_KEY`
- `GIF_MODE=disabled|remote`
- `GIF_SERVICE_BASE_URL`
- `GIF_SERVICE_TOKEN`
- `MEDIA_ALLOWED_DOMAINS`
- `GATEWAY_ATTACHMENT_MAX_BYTES` (default `8388608`)
- `GATEWAY_ATTACHMENT_MAX_ITEMS` (default `4`)
- `GATEWAY_ATTACHMENT_TIMEOUT_MS` (default `10000`)

Legacy aliases are still accepted for one deprecation cycle:

- `MEDIA_WORKER_BASE_URL`
- `MEDIA_WORKER_TOKEN`
- `MEDIA_WORKER_TIMEOUT_MS`

If storage is unavailable, the listener falls back to the default guild preview settings.

When the preview provider returns direct image or video URLs, the listener re-uploads them as Discord attachments so the reply can render as native media instead of only an embed thumbnail. Large or unsupported media falls back to metadata-only embeds.

If `PORT` is present, the listener also exposes:

- `/`
- `/health`
- `/healthz`

## Run Locally

```bash
pnpm gateway:listen
```

## Render Standard Notes

- Build command: `pnpm install && pnpm prisma:generate`
- Start command: `pnpm gateway:listen`
- Health check path: `/healthz`

Choose a region that can pass both:

- Discord Gateway login
- Discord REST probe

For operational details, see [docs/en/runbooks/render-gateway-listener.md](../../docs/en/runbooks/render-gateway-listener.md).

## Permissions Checklist

- enable **Message Content Intent** in Discord Developer Portal
- invite the bot with `Read Messages/View Channels`, `Send Messages`, `Embed Links`, and `Attach Files`
- keep this process running on an always-on host
