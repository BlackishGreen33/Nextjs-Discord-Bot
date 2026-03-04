# Discord Gateway Listener (Auto Link Cards)

This process listens to `MESSAGE_CREATE` events and auto-replies with media cards
when users paste supported URLs (default: X/Twitter).

## Why this service exists

Your current Next.js webhook handles interactions only. It cannot natively receive all
message events. Auto link detection requires a Discord Gateway client.

## Required env vars

- `DISCORD_GATEWAY_TOKEN` (or `BOT_TOKEN`)

## Optional env vars

- `MEDIA_ALLOWED_DOMAINS` (default: `x.com,twitter.com`)
- `MEDIA_WORKER_BASE_URL` (for metadata preview)
- `MEDIA_WORKER_TOKEN` (Bearer token for media worker)

## Run locally

```bash
node worker/gateway-listener/index.mjs
```

## Permissions checklist

- Enable **Message Content Intent** in Discord Developer Portal.
- Invite bot with `Read Messages/View Channels`, `Send Messages`, `Embed Links`.
- Keep this process running in a container environment (Cloudflare Containers, Railway, etc.).
