# Production Register-Commands Runbook

## 目的

本文件記錄正式環境重新註冊 Slash Commands 的操作方式。

## 什麼時候要執行

1. Slash command 新增、刪除或重新命名後
2. 指令描述、選項或 localizations 變更後
3. Discord client 顯示的正式指令與目前程式碼不同步時

## 前置條件

- 已持有 `REGISTER_COMMANDS_KEY`
- 已知正式環境的 Next.js App URL
- 正式環境的 `/api/discord-bot/register-commands` 可連通

## 請求格式

```http
POST /api/discord-bot/register-commands
Authorization: Bearer <REGISTER_COMMANDS_KEY>
```

## 執行步驟

### 1. 對正式環境發送請求

範例：

```bash
curl -X POST \
  "https://<your-vercel-app>.vercel.app/api/discord-bot/register-commands" \
  -H "Authorization: Bearer <REGISTER_COMMANDS_KEY>"
```

### 2. 確認回應

正常情況應回：

- HTTP `200`
- JSON `{"error":null}` 或等效成功回應

### 3. 遇到 rate limit 時處理

若回應為：

- HTTP `429`

則依 `Retry-After` 標頭等待後再重試。

## 補充說明

- 此端點目前有 rate limit：每 IP 每分鐘最多 `5` 次
- 開發環境可由首頁按鈕觸發註冊，不需同樣的正式流程
- 若註冊成功但 Discord client 尚未立即刷新，可稍等幾分鐘再重新開啟 slash command 選單
