# AGENTS.md

本文件僅記錄目前可由 repo 實作、專案內文件與現有 runbook 直接驗證的工作流程，供維護與自動化執行時遵循。

## 核心原則

- 只依據 repo 目前可驗證的實作、指令與文件行事。
- 變更優先最小範圍，避免改動無關檔案。
- 若資訊不足，先標記 `TODO`，不要臆測外部平台行為。
- 外部部署狀態若會變動，應寫入 runbook，不硬編碼在核心規範中。

## 專案與環境

- 專案：Next.js App Router（TypeScript）Discord Bot
- Node.js：20+
- 套件管理：pnpm 10+
- 主要 HTTP 路由：
  - `POST /api/discord-bot/interactions`
  - `POST /api/discord-bot/register-commands`
  - `GET /api/discord-bot/debug`

## 本專案已驗證指令

- `pnpm install`：安裝依賴
- `pnpm dev`：啟動本機開發伺服器
- `pnpm build`：建立 production build
- `pnpm start`：啟動 production server
- `pnpm lint`：執行 ESLint
- `pnpm typecheck`：執行 `tsc --noEmit`
- `pnpm test`：執行 Vitest（`vitest run`）
- `pnpm prettier`：執行 `prettier --write .`
- `pnpm gateway:listen`：啟動 Discord Gateway listener（自動連結卡片）
- `pnpm worker:smoke`：檢查 live media worker 基本功能

## 目前實作重點

### 1. Slash Commands

目前註冊的核心指令：

- `/ping`
- `/help`
- `/faq`
- `/settings`

### 2. Interaction 分派

- `POST /api/discord-bot/interactions` 先驗簽
- `Ping` 互動回傳 pong
- Slash command 由 `src/commands` 分派
- Message component 由 `src/common/utils/media-component-handler.ts` 分派
- 目前 component 行為以：
  - settings 面板
  - preview card 的 translate / gif / retract
    為主

### 3. 自動預覽卡片

- 自動預覽不是 Next.js webhook 直接處理
- 需額外啟動 `worker/gateway-listener/index.mjs`
- 支援平台：
  - X / Twitter
  - Pixiv
  - Bluesky
- 預覽資料、翻譯、GIF 任務會經過外部 media worker

### 4. 儲存層

- Guild 設定與 FAQ 目前使用 Upstash Redis
- 若 Redis 不可用：
  - FAQ 功能不可用
  - listener 對 guild 設定會回退到預設值

## 既有工作流程

### 1. 本地開發

1. 建立 `.env.local`（參考 `.env.example`）
2. 執行 `pnpm install`
3. 執行 `pnpm dev`
4. 若要測試自動預覽，另外執行 `pnpm gateway:listen`

### 2. Discord 指令註冊

1. 開發環境可由首頁按鈕觸發 `POST /api/discord-bot/register-commands`
2. 正式環境下需帶：
   - `Authorization: Bearer <REGISTER_COMMANDS_KEY>`
3. 註冊端點有 rate limit：每 IP 每分鐘最多 `5` 次
4. 正式操作流程見：
   - `docs/runbooks/register-commands.md`

### 3. Gateway Listener 維運

1. 需在 Discord Developer Portal 開啟 **Message Content Intent**
2. 若 `PORT` 存在，listener 會額外暴露：
   - `/`
   - `/health`
   - `/healthz`
3. 正式 MVP 的雲端 listener 維運流程見：
   - `docs/runbooks/render-gateway-listener.md`
4. 目前 runbook 以 Render Web Service 為推薦 MVP 路線；實際 region 應以可通過 Discord Gateway 與 REST 探測者為準

### 4. 除錯檢查

1. `GET /api/discord-bot/debug` 僅非 production 可用
2. 需帶：
   - `Authorization: Bearer <REGISTER_COMMANDS_KEY>`
3. 回傳環境變數就緒狀態與 Discord API 健康檢查

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

- 測試框架：Vitest（`pnpm test`）
- API 與工具函式測試檔使用 `*.test.ts`
- Gateway listener 媒體附件行為有 `worker/gateway-listener/preview-attachments.test.ts`

## 文件與 Runbook

- 對外說明與部署總覽：`README.md`
- Gateway listener 維運：`docs/runbooks/render-gateway-listener.md`
- 正式指令註冊：`docs/runbooks/register-commands.md`
