# AGENTS.md

本文件僅記錄目前可由 repo 直接驗證的工作流程與指令，供維護與自動化執行時遵循。

## 核心原則

- 先用現有指令與流程驗證，再新增規範。
- 文件描述必須對應現況實作，不描述理想狀態。
- 若資訊不足，先加一則簡短 TODO，不臆測。

## 專案與環境

- 專案：Next.js App Router（TypeScript）Discord Bot。
- Node.js：20+
- 套件管理：pnpm 10+
- 主要路由：
  - `POST /api/discord-bot/interactions`
  - `POST /api/discord-bot/register-commands`
  - `GET /api/discord-bot/debug`

## 常用指令

- 安裝依賴：`pnpm install`
- 本地開發：`pnpm dev`
- 建置：`pnpm build`
- 啟動正式模式：`pnpm start`
- 程式碼檢查：`pnpm lint`
- 型別檢查：`pnpm typecheck`
- 測試：`pnpm test`
- 格式化：`pnpm prettier`

## 既有工作流程

### 1. 本地開發

1. 建立 `.env.local`（參考 `.env.example`）。
2. 執行 `pnpm install`。
3. 執行 `pnpm dev`。

### 2. Discord 指令註冊

1. 開發環境可由首頁按鈕觸發 `POST /api/discord-bot/register-commands`。
2. 正式環境下，`POST /api/discord-bot/register-commands` 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。
3. 註冊端點有 rate limit，超過時回傳 `429` 與 `Retry-After`。

### 3. Interaction 驗證與分派

1. `POST /api/discord-bot/interactions` 會先驗簽（`x-signature-ed25519`、`x-signature-timestamp`）。
2. `Ping` 互動回傳 pong。
3. Slash command 由 `src/commands` 分派；未知或執行失敗時回傳 ephemeral 錯誤訊息。

### 4. 除錯檢查

1. `GET /api/discord-bot/debug` 僅非 production 可用。
2. 需 `Authorization: Bearer <REGISTER_COMMANDS_KEY>`。
3. 回傳環境變數就緒狀態與 Discord API 健康檢查。

### 5. 提交前與 CI

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

## TODO

- TODO: 補上正式環境「何時/由誰觸發 register-commands」操作 runbook（目前 repo 僅定義端點保護機制）。
