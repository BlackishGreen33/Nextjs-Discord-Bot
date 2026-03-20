# AGENTS.md

This file records only workflows, commands, and runbooks that can be verified directly from the current repository state.

## Core Principles

- Act only on implementations, commands, and documents that are verifiable in this repo.
- Prefer the smallest possible change set.
- If information is missing, add a `TODO` instead of guessing external platform behavior.
- If deployment details may change over time, keep them in runbooks rather than hardcoding them into core repo guidance.

## Project and Environment

- Project: Next.js App Router Discord Bot written in TypeScript
- Node.js: 20+
- Package manager: pnpm 10+
- Main HTTP routes:
  - `POST /api/discord-bot/interactions`
  - `POST /api/discord-bot/register-commands`
  - `GET /api/discord-bot/debug`

## Verified Commands

- `pnpm install`: install dependencies
- `pnpm dev`: start the local development server
- `pnpm build`: build the production bundle
- `pnpm start`: start the production server
- `pnpm lint`: run ESLint
- `pnpm typecheck`: run `tsc --noEmit`
- `pnpm test`: run Vitest (`vitest run`)
- `pnpm prettier`: run `prettier --write .`
- `pnpm gateway:listen`: start the Discord Gateway listener for auto preview cards
- `pnpm worker:smoke`: run a live media worker smoke test

## Current Functional Areas

### 1. Slash Commands

Currently registered core commands:

- `/ping`
- `/help`
- `/faq`
- `/settings`

### 2. Interaction Dispatch

- `POST /api/discord-bot/interactions` verifies Discord signatures first
- `Ping` interactions return `pong`
- Slash commands are dispatched from `src/commands`
- Message components are dispatched from `src/common/utils/media-component-handler.ts`
- Current component flows are focused on:
  - the settings panel
  - preview card actions: translate / gif / retract

### 3. Automatic Preview Cards

- Auto preview is not handled directly by the Next.js webhook routes
- It requires `worker/gateway-listener/index.mjs` to be running separately
- Supported platforms:
  - X / Twitter
  - Pixiv
  - Bluesky
- Preview metadata, translation, and GIF tasks go through the external media worker

### 4. Storage Layer

- Guild settings and FAQ data use Upstash Redis
- If Redis is unavailable:
  - FAQ features are unavailable
  - listener guild settings fall back to defaults

## Existing Workflows

### 1. Local Development

1. Create `.env.local` from `.env.example`
2. Run `pnpm install`
3. Run `pnpm dev`
4. If you need to test auto preview locally, also run `pnpm gateway:listen`

### 2. Discord Command Registration

1. In development, registration can be triggered from the home page via `POST /api/discord-bot/register-commands`
2. In production, requests must include:
   - `Authorization: Bearer <REGISTER_COMMANDS_KEY>`
3. The endpoint is rate-limited to `5` requests per IP per minute
4. The verified production procedure is documented in:
   - `docs/en/runbooks/register-commands.md`

### 3. Gateway Listener Operations

1. Enable **Message Content Intent** in the Discord Developer Portal
2. If `PORT` is set, the listener also exposes:
   - `/`
   - `/health`
   - `/healthz`
3. The recommended MVP cloud operations flow is documented in:
   - `docs/en/runbooks/render-gateway-listener.md`
4. The current runbook recommends Render Web Service as the MVP path; actual region selection should be based on successful Discord Gateway login and REST probing

### 4. Debug Checks

1. `GET /api/discord-bot/debug` is available only outside production
2. It requires:
   - `Authorization: Bearer <REGISTER_COMMANDS_KEY>`
3. It returns environment readiness and Discord API health information

### 5. Pre-commit and CI

- Husky `pre-commit`:
  - `pnpm exec eslint --fix .`
  - `pnpm exec prettier --write "**/*.{ts,tsx,js,jsx}" --log-level error`
  - `git add -u`
- GitHub Actions on push/PR to `main` run:
  - `pnpm prettier --check .`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## Testing Conventions

- Test framework: Vitest (`pnpm test`)
- API and utility tests use `*.test.ts`
- Gateway listener attachment behavior is covered by `worker/gateway-listener/preview-attachments.test.ts`

## Documentation and Runbooks

- Public overview and deployment entry point: `README.md`
- Gateway listener operations: `docs/en/runbooks/render-gateway-listener.md`
- Production command registration: `docs/en/runbooks/register-commands.md`
