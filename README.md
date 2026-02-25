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
- `src/common/utils/*`: shared helpers

## Deployment Notes

- Keep secrets server-side only.
- Do not expose `BOT_TOKEN`, `PUBLIC_KEY`, or `REGISTER_COMMANDS_KEY` to client bundles.
- For horizontal scaling, configure Upstash Redis vars so rate limiting is shared across instances.
