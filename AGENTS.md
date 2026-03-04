# AGENTS.md

本文件僅記錄目前可由 repo 直接驗證的工作流程與指令，供維護與自動化執行時遵循。

## 核心原則

- 只依據 repo 目前可驗證的實作與設定行事。
- 變更優先最小範圍，避免改動無關檔案。
- 若資訊不足，先新增 `TODO`，不要臆測。

## 專案與環境

- 專案：Next.js App Router（TypeScript）Discord Bot。
- Node.js：20+
- 套件管理：pnpm 10+
- 主要路由：
  - `POST /api/discord-bot/interactions`
  - `POST /api/discord-bot/register-commands`
  - `GET /api/discord-bot/debug`

## 本專案已驗證指令

- `pnpm install`：安裝依賴。
- `pnpm dev`：啟動本機開發伺服器。
- `pnpm build`：建立 production build。
- `pnpm start`：啟動 production server。
- `pnpm lint`：執行 ESLint。
- `pnpm typecheck`：執行 `tsc --noEmit`。
- `pnpm test`：執行 Vitest（`vitest run`）。
- `pnpm prettier`：執行 `prettier --write .`。
- `pnpm gateway:listen`：啟動 Discord Gateway listener（自動連結卡片）。

## 既有工作流程

### 1. 本地開發

1. 建立 `.env.local`（參考 `.env.example`）。
2. 執行 `pnpm install`。
3. 執行 `pnpm dev`。

### 2. Discord 指令註冊

1. 開發環境可由首頁按鈕觸發 `POST /api/discord-bot/register-commands`。
2. 正式環境下，`POST /api/discord-bot/register-commands` 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。
3. 註冊端點有 rate limit（每 IP 每分鐘最多 5 次），超過時回傳 `429` 與 `Retry-After`。

### 3. Interaction 驗證與分派

1. `POST /api/discord-bot/interactions` 會先驗簽（`x-signature-ed25519`、`x-signature-timestamp`）。
2. `Ping` 互動回傳 pong。
3. Slash command 由 `src/commands` 分派；未知或執行失敗時回傳 ephemeral 錯誤訊息。
4. Message component（按鈕）由 `src/common/utils/media-component-handler.ts` 分派，支援 media card 的下載與刪除互動。

### 4. 自動連結卡片（Gateway）

1. 貼連結自動回卡片需額外執行 `worker/gateway-listener/index.mjs`（非 Next.js webhook）。
2. 需在 Discord Developer Portal 開啟 Message Content Intent。
3. 連結預覽/下載由外部 media worker（例如 `worker/cloudflare-media-proxy`）處理。

### 5. 除錯檢查

1. `GET /api/discord-bot/debug` 僅非 production 可用。
2. 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。
3. 回傳環境變數就緒狀態與 Discord API 健康檢查。

### 6. 提交前與 CI

- Husky `pre-commit`：
  - `pnpm exec eslint --fix .`
  - `pnpm exec prettier --write "**/*.{ts,tsx,js,jsx}" --log-level error`
  - `git add -u`
- GitHub Actions（push/PR 到 `main`）執行：
  - `pnpm prettier --check .`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## 測試慣例

- 測試框架：Vitest（`pnpm test`）。
- API 與工具函式測試檔使用 `*.test.ts`（例如 route 與 verify 工具）。

## Runbook

- 正式環境 `register-commands` 操作流程已記錄於 `README.md` 的 `Production Register-Commands Runbook` 章節。
