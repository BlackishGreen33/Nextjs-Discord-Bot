# Discord Gateway Listener

This process listens to `MESSAGE_CREATE` events and auto-replies with preview cards when users paste supported X / Twitter, Pixiv, or Bluesky URLs.

## Why This Exists

The Next.js app only handles slash commands and component interactions. Automatic link detection requires a Discord Gateway client with a persistent WebSocket connection.

## Required Environment Variables

- `DISCORD_GATEWAY_TOKEN` or `BOT_TOKEN`

## Optional Environment Variables

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `REDIS_NAMESPACE`
- `MEDIA_ALLOWED_DOMAINS`
- `MEDIA_WORKER_BASE_URL`
- `MEDIA_WORKER_TOKEN`
- `GATEWAY_ATTACHMENT_MAX_BYTES` (default `8388608`)
- `GATEWAY_ATTACHMENT_MAX_ITEMS` (default `4`)
- `GATEWAY_ATTACHMENT_TIMEOUT_MS` (default `10000`)

If Redis is missing, the listener falls back to the default guild preview settings.

When the preview provider returns direct image or video URLs, the listener re-uploads them as Discord attachments so the reply can render as native media instead of only an embed thumbnail. Large or unsupported media falls back to the metadata embed.

If `PORT` is present, the listener also starts a tiny HTTP health server and responds on:

- `/`
- `/health`
- `/healthz`

## Run Locally

```bash
node worker/gateway-listener/index.mjs
```

## Render MVP Deployment

The currently validated cloud path is:

- platform: Render Web Service
- health path: `/healthz`
- optional keepalive: UptimeRobot or an equivalent monitor that periodically requests `/healthz`

Choose a region that can successfully complete both:

- Discord Gateway login
- Discord REST probe

For operational details, see:

- [docs/en/runbooks/render-gateway-listener.md](../../docs/en/runbooks/render-gateway-listener.md)

## Permissions Checklist

- enable **Message Content Intent** in Discord Developer Portal
- invite the bot with `Read Messages/View Channels`, `Send Messages`, `Embed Links`, and `Attach Files`
- keep this process running on an always-on host
