# Nextjs Discord Bot

A Next.js App Router project for handling Discord interactions, registering slash commands, and basic bot operations.

## Requirements

- Node.js 20+
- pnpm 10+
- A Discord application and bot token

## Environment Variables

Create `.env.local` from `.env.example` and fill the values below:

- `NEXT_PUBLIC_APPLICATION_ID`: Discord application ID
- `PUBLIC_KEY`: Discord interaction public key
- `BOT_TOKEN`: Discord bot token
- `REGISTER_COMMANDS_KEY`: Secret key for protected command registration in production
- `UPSTASH_REDIS_REST_URL` (optional): Redis REST URL for distributed rate limiting
- `UPSTASH_REDIS_REST_TOKEN` (optional): Redis REST token for distributed rate limiting
- `REDIS_NAMESPACE` (optional): Redis key namespace prefix for FAQ storage (default: `discord-bot`)
- `MEDIA_WORKER_BASE_URL` (optional): external worker URL for media preview/download
- `MEDIA_WORKER_TOKEN` (optional): bearer token for media worker
- `MEDIA_WORKER_TIMEOUT_MS` (optional): worker request timeout in milliseconds
- `MEDIA_ALLOWED_DOMAINS` (optional): comma-separated URL domain allowlist for media links
- `DISCORD_GATEWAY_TOKEN` (optional): token used by gateway listener process (defaults to `BOT_TOKEN`)

## Install

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

The app runs on `http://localhost:3000`.

## Scripts

- `pnpm lint`: run ESLint
- `pnpm typecheck`: run TypeScript checks (`tsc --noEmit`)
- `pnpm test`: run Vitest test suite
- `pnpm build`: build for production
- `pnpm start`: start production server
- `pnpm gateway:listen`: run the Discord Gateway listener for auto link cards

## Slash Command Registration

- Development:
  - Use the home page "Register Commands" button.
  - Route: `POST /api/discord-bot/register-commands`
- Production:
  - Registration is server-managed.
  - `POST /api/discord-bot/register-commands` requires `Authorization: Bearer <REGISTER_COMMANDS_KEY>`.
  - Endpoint has rate limiting and returns `429` with `Retry-After` when throttled.

## Interaction Endpoint

- Discord webhook target:
  - `POST /api/discord-bot/interactions`
- Features:
  - Signature verification (`x-signature-ed25519` / `x-signature-timestamp`)
  - Ping support
  - Command dispatch from `src/commands`
  - Ephemeral fallback errors on unknown or failed commands

## FAQ Command

- Slash command: `/faq`
- Subcommands:
  - `/faq get <key>`: get FAQ answer in channel
  - `/faq list`: list FAQ keys in channel
  - `/faq set <key> <answer>`: admin/mod only, stored as ephemeral result
  - `/faq delete <key>`: admin/mod only, stored as ephemeral result
- Notes:
  - FAQ keys are normalized to lowercase slug format (`welcome-rules`).
  - FAQ data is guild-scoped and stored in Upstash Redis.
  - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are required to enable FAQ storage.

## Download Command and Media Buttons

- Slash command: `/download <url>`
- Behavior:
  - Validates URL against `MEDIA_ALLOWED_DOMAINS`
  - Requests preview data from `MEDIA_WORKER_BASE_URL` (or uses fallback preview)
  - Posts a media card with action buttons:
    - `Download Video`
    - `Download Audio`
    - `Delete`
- Button interaction:
  - `Download Video` / `Download Audio`: calls media worker `POST /v1/download`
  - `Delete`: only card owner or admins can remove the card

## Auto Link Cards (Gateway Listener)

- To support \"user pastes URL -> bot auto replies with card\", run:
  - `worker/gateway-listener/index.mjs`
- Why this is separate:
  - Current Next.js webhook handles interactions only
  - Discord message events (`MESSAGE_CREATE`) require a Gateway client process
- Requirements:
  - Enable **Message Content Intent** in Discord Developer Portal
  - Deploy gateway listener as an always-on process (container/VM)

## Cloudflare Media Worker

- Worker scaffold path: `worker/cloudflare-media-proxy`
- Endpoints:
  - `POST /v1/preview`
  - `POST /v1/download`
- Strategy:
  - Third-party first (cobalt API)
  - Optional fallback API (self-hosted yt-dlp service)
- See:
  - `worker/cloudflare-media-proxy/README.md`

## Production Register-Commands Runbook

When to run:
1. After deploying changes that add/remove/rename slash commands.
2. After changing command descriptions/options.
3. During incident recovery if commands are out of sync with code.

Who should run:
1. A deploy operator with production access and `REGISTER_COMMANDS_KEY`.

How to run:
1. Call `POST /api/discord-bot/register-commands` with `Authorization: Bearer <REGISTER_COMMANDS_KEY>`.
2. Confirm `200` response and check logs for `registered`.
3. If you receive `429`, wait `Retry-After` seconds and retry.
4. Verify in Discord client that command list reflects the latest code.

## Debug Endpoint

- Route: `GET /api/discord-bot/debug`
- Available in non-production only
- Requires `Authorization: Bearer <REGISTER_COMMANDS_KEY>`
- Returns environment readiness and Discord API health checks

## CI

GitHub Actions workflow runs on push/PR to `main`:

1. `pnpm typecheck`
2. `pnpm prettier --check .`
3. `pnpm lint`
4. `pnpm test`

## Project Structure

- `src/app/api/discord-bot/interactions/route.ts`: Discord interactions webhook
- `src/app/api/discord-bot/register-commands/route.ts`: command registration endpoint
- `src/app/api/discord-bot/debug/route.ts`: debug checks endpoint
- `src/commands/*`: slash command implementations
- `src/common/stores/*`: Redis-backed FAQ storage abstraction
- `src/common/utils/*`: shared helpers
- `worker/cloudflare-media-proxy/*`: Cloudflare Worker for media proxy
- `worker/gateway-listener/*`: Discord Gateway listener for auto link cards

## Deployment Notes

- Keep secrets server-side only.
- Do not expose `BOT_TOKEN`, `PUBLIC_KEY`, or `REGISTER_COMMANDS_KEY` to client bundles.
- For horizontal scaling, configure Upstash Redis vars so rate limiting is shared across instances.
