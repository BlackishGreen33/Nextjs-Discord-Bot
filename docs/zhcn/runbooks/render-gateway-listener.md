# Render Gateway Listener 运维手册

> 语言： [English](../../en/runbooks/render-gateway-listener.md) · [繁體中文](../../zhtw/runbooks/render-gateway-listener.md) · [简体中文](./render-gateway-listener.md)

## 目的

本文档记录使用 **Render Web Service** 运行 Discord Gateway listener 的推荐 MVP 运维流程。

listener 的职责是：

- 保持 Discord Gateway 常驻连接
- 监听 `MESSAGE_CREATE`
- 针对支持的平台自动回复预览卡片
- 提供 `/healthz` 给 Render 与外部保活服务检查

## 推荐部署方式

- 平台：Render Web Service
- Health Check Path：`/healthz`
- 外部保活：UptimeRobot 或同类服务定期 `GET /healthz`

> [!IMPORTANT]
> 不要把项目文档绑定到单一服务名、固定 URL 或单一 region。对开源项目来说，应该记录的是部署原则与验证标准。

## Region 选择原则

如果某个 region 在实测时出现：

- `restProbe.status = 429`
- 响应摘要包含 `Access denied | discord.com used Cloudflare to restrict ...`

通常说明问题不在应用本身，而在该 region 的出站网络路径被 Discord / Cloudflare 限制。

合格的 region 至少应满足：

- `ready = true`
- `gatewayPhase = "ready"`
- `restProbe.ok = true`

## 健康检查解读

正常情况下，`/healthz` 至少应包含：

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

### 字段说明

- `ready`
  - `true`：Discord Gateway 已完成 ready
  - `false`：listener 尚未完成登录
- `gatewayPhase`
  - `ready`：正常
  - `login_pending`：登录流程尚未完成
  - `login_timeout`：登录流程卡住超时
  - `login_failed`：token 或登录流程直接失败
  - `shard_disconnected`：Gateway 被断线
- `gatewayLastError`
  - 最近一次 listener 记录到的错误摘要
- `restProbe`
  - `ok = true`：Discord REST 探测正常
  - `ok = false`：通常表示 Render 出站流量或 Discord 侧限制
- `debugMessages`
  - 最近几条 Discord Gateway debug 信息，便于快速判断 heartbeat、identify、ready 流程

## UptimeRobot 建议配置

- Monitor Type：`HTTP(s)`
- Method：`GET`
- URL：`https://<your-render-service>.onrender.com/healthz`
- Interval：`14 minutes`

> [!NOTE]
> 外部保活只能降低免费服务休眠造成的冷启动影响，不能解决 Discord / Cloudflare 对特定 region 出站流量的限制。

## 部署更新流程

### 1. 修改 listener 程序

主要文件：

- `worker/gateway-listener/index.mjs`
- `worker/gateway-listener/preview-attachments.mjs`
- `worker/gateway-listener/ui-text.mjs`

### 2. Push 到 Render 监看的 branch

Render Web Service 会按配置的 branch 自动 redeploy。

参考：

- [Render Deploys](https://render.com/docs/deploys)
- [Render Web Services](https://render.com/docs/web-services)

### 3. 检查 `/healthz`

部署完成后确认：

1. `ready = true`
2. `gatewayPhase = "ready"`
3. `restProbe.ok = true`
4. `gatewayLastError = null` 或没有持续变化中的错误

### 4. Discord 实测

在 Guild 频道发送新的：

- `x.com` / `twitter.com`
- `pixiv.net`
- `bsky.app`

确认 Bot 会自动回复预览卡。

## 故障排查

### 症状：`login_pending`

表示已经调用 `client.login()`，但尚未进入 `ready`。

先检查：

1. `restProbe.ok`
2. `restProbe.status`
3. `debugMessages`
4. Render deploy logs

### 症状：`login_timeout`

表示 Discord Gateway 登录流程卡住。

优先检查：

1. `restProbe.status`
2. `gatewayLastError`
3. 是否同时存在多个 listener 实例

### 症状：`restProbe.status = 429` 且摘要含 `Access denied`

通常表示当前 Render region / egress IP 被 Discord / Cloudflare 拦住。

处理方式：

1. 新建其他 region 的 Render 服务重新测试
2. 验证新服务的 `/healthz`
3. 确认旧 listener 停用，避免双开

## 操作注意事项

- 不要同时保留多个可正常登录的 Gateway listener，否则可能重复回卡
- 若同时存在其他本地或云端 listener，正式 listener 上线后应停掉旧实例
- `/healthz` 是判断 listener 是否真正可用的第一指标，不要只看 Render service 是否显示 running

## 参考文档

- [Render Web Services](https://render.com/docs/web-services)
- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Deploys](https://render.com/docs/deploys)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
