# 生产环境 Register-Commands 运维手册

> 语言： [English](../../en/runbooks/register-commands.md) · [繁體中文](../../zhtw/runbooks/register-commands.md) · [简体中文](./register-commands.md)

## 目的

本文档记录生产环境重新注册 Slash Commands 的操作方式。

## 什么时候执行

1. Slash command 新增、删除或重命名后
2. 指令描述、选项或 localizations 变更后
3. Discord client 显示的正式指令与当前代码不同步时

## 前置条件

- 已持有 `REGISTER_COMMANDS_KEY`
- 已知生产环境的 Next.js App URL
- 生产环境的 `/api/discord-bot/register-commands` 可连通

## 请求格式

```http
POST /api/discord-bot/register-commands
Authorization: Bearer <REGISTER_COMMANDS_KEY>
```

## 执行步骤

### 1. 向生产环境发送请求

示例：

```bash
curl -X POST \
  "https://<your-vercel-app>.vercel.app/api/discord-bot/register-commands" \
  -H "Authorization: Bearer <REGISTER_COMMANDS_KEY>"
```

### 2. 确认响应

正常情况下应返回：

- HTTP `200`
- JSON `{"error":null}` 或等效成功响应

### 3. 遇到 rate limit 时处理

如果返回：

- HTTP `429`

则根据 `Retry-After` 响应头等待后再重试。

## 补充说明

- 当前端点有 rate limit：每 IP 每分钟最多 `5` 次
- 开发环境可通过首页按钮触发注册，无需同样的生产流程
- 若注册成功后 Discord client 没有立刻刷新，可等待几分钟后重新打开 slash command 菜单
