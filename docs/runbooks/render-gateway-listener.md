# Render Gateway Listener Runbook

> 適用對象：維運目前這個 Discord Bot MVP 的操作人員。

## 目的

本文件記錄 **Render Web Service** 版 Gateway listener 的推薦 MVP 維運流程。

這條路線的責任是：

- 維持 Discord Gateway 常駐連線
- 監聽 `MESSAGE_CREATE`
- 針對支援平台自動回覆預覽卡片
- 提供 `/healthz` 給 Render 與外部保活服務檢查

## 推薦部署形式

- 平台：Render Web Service
- Health Check Path：`/healthz`
- 外部保活：可用 UptimeRobot 或同類服務定期 `GET /healthz`

> [!IMPORTANT]
> 不要把專案文件綁定到單一服務名稱、固定網址或單一 region。對開源專案來說，應記錄的是「判斷標準」與「部署原則」。

## Region 選擇原則

若某個 region 的 listener 實測出現：

- `restProbe.status = 429`
- 回應摘要包含 `Access denied | discord.com used Cloudflare to restrict ...`

這表示問題通常不在應用程式本身，而是在該 region 的出站網路路徑被 Discord / Cloudflare 限制。

合格的 region 應至少滿足：

- `ready = true`
- `gatewayPhase = "ready"`
- `restProbe.ok = true`

## 健康檢查判讀

正常情況下，`/healthz` 應至少包含：

```json
{
  "ready": true,
  "gatewayPhase": "ready",
  "restProbe": {
    "ok": true,
    "status": 200
  }
}
```

### 欄位說明

- `ready`
  - `true`：Discord Gateway 已完成 ready
  - `false`：listener 尚未完成登入
- `gatewayPhase`
  - `ready`：正常
  - `login_pending`：登入流程尚未完成
  - `login_timeout`：登入卡住超時
  - `login_failed`：token 或登入流程直接失敗
  - `shard_disconnected`：Gateway 被斷線
- `gatewayLastError`
  - 最近一次 listener 記錄到的錯誤摘要
- `restProbe`
  - `ok = true`：Discord REST 探測正常
  - `ok = false`：通常表示 Render 出站流量或 Discord 側限制
- `debugMessages`
  - 最近幾筆 Discord Gateway debug 訊息，方便快速判讀心跳、identify、ready 流程

## UptimeRobot 建議設定

- Monitor Type：`HTTP(s)`
- Method：`GET`
- URL：`https://<your-render-service>.onrender.com/healthz`
- Interval：`14 minutes`

> [!NOTE]
> UptimeRobot 只能降低 Render free service 休眠造成的冷啟動影響，不能解決 Discord / Cloudflare 對特定 Render region 出站流量的限制。

## 部署更新流程

### 1. 修改 listener 程式

主要檔案：

- `worker/gateway-listener/index.mjs`
- `worker/gateway-listener/preview-attachments.mjs`
- `worker/gateway-listener/ui-text.mjs`

### 2. Push 到 Render 監看的 branch

Render Web Service 會依設定 branch 自動 redeploy。

參考：

- [Render Deploys](https://render.com/docs/deploys)
- [Render Web Services](https://render.com/docs/web-services)

### 3. 檢查 `/healthz`

部署完成後確認：

1. `ready = true`
2. `gatewayPhase = "ready"`
3. `restProbe.ok = true`
4. `gatewayLastError = null` 或沒有持續變化中的錯誤

### 4. Discord 實測

在 Guild 頻道貼新的：

- `x.com` / `twitter.com`
- `pixiv.net`
- `bsky.app`

確認 Bot 會自動回覆預覽卡。

## 故障排查

### 症狀：`login_pending`

表示已呼叫 `client.login()`，但尚未進到 `ready`。

先檢查：

1. `restProbe.ok`
2. `restProbe.status`
3. `debugMessages`
4. Render deploy logs

### 症狀：`login_timeout`

表示 Discord Gateway 登入流程卡住。

優先檢查：

1. `restProbe.status`
2. `gatewayLastError`
3. 是否同時存在多個 listener 實例

### 症狀：`restProbe.status = 429` 且摘要含 `Access denied`

這通常表示當前 Render region / egress IP 被 Discord / Cloudflare 擋住。

處理方式：

1. 另建其他 region 的 Render 服務重新測試
2. 驗證新服務的 `/healthz`
3. 確認舊 listener 停用，避免雙開

## 操作注意事項

- 不要同時保留多個可正常登入的 Gateway listener，否則可能重複回卡
- 若同時存在其他本機或雲端 listener，正式 listener 上線後應停掉舊實例
- `/healthz` 是目前判斷 listener 是否真正可用的第一指標，不要只看 Render service 是否顯示 running

## 參考文件

- [Render Web Services](https://render.com/docs/web-services)
- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Deploys](https://render.com/docs/deploys)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
