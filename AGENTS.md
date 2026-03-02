# AGENTS.md

## 核心原則

- 只依據 repo 目前可驗證的實作與設定行事。
- 變更優先最小範圍，避免改動無關檔案。
- 若需求無法從程式碼或現有文件確認，先新增 `TODO`，不要臆測。

## 本專案已驗證指令

- `pnpm dev`：啟動本機開發伺服器（Next.js）。
- `pnpm build`：建立 production build。
- `pnpm start`：啟動 production server。
- `pnpm lint`：執行 ESLint。
- `pnpm typecheck`：執行 `tsc --noEmit`。
- `pnpm test`：執行 Vitest（`vitest run`）。
- `pnpm prettier`：執行 `prettier --write .`。

## Git 與提交前流程

- Husky `pre-commit` 目前會依序執行：
  - `pnpm exec eslint --fix .`
  - `pnpm exec prettier --write "**/*.{ts,tsx,js,jsx}" --log-level error`
  - `git add -u`
- 若上述任一步驟失敗，提交會中止。

## CI 工作流程（GitHub Actions）

- Workflow：`.github/workflows/lint_and_format_check.yml`
- 觸發條件：`push` 到 `main`、`pull_request` 目標 `main`
- Jobs：
  - `format`：`pnpm prettier --check .`
  - `lint`：`pnpm lint`
  - `typecheck`：`pnpm typecheck`
  - `test`：`pnpm test`

## Discord API 路由行為（現況）

- `POST /api/discord-bot/interactions`
  - 驗證 Discord 簽章（`x-signature-ed25519`、`x-signature-timestamp`）。
  - 支援 Ping 與 slash command dispatch（`src/commands`）。
- `POST /api/discord-bot/register-commands`
  - Production 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。
  - 有 rate limit（每 IP 每分鐘 5 次），超限回 `429` 並附 `Retry-After`。
- `GET /api/discord-bot/debug`
  - 僅非 production 可用，production 回 `404`。
  - 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。

## TODO（待確認）

- TODO: 尚未在 repo 內找到「正式環境指令註冊」的操作手冊（目前僅能確認 API 行為）；若未來新增 runbook，請補到本檔與 README。
