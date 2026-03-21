# Render Gateway Listener Runbook

> Languages: [English](./render-gateway-listener.md) · [繁體中文](../../zhtw/runbooks/render-gateway-listener.md) · [简体中文](../../zhcn/runbooks/render-gateway-listener.md)

## Purpose

This document describes the recommended MVP operations flow for running the Discord Gateway listener on a **Render Web Service**.

This runbook assumes the repository's recommended deployment profile:

- `web` + `listener` + `db`
- `STORAGE_DRIVER=prisma`
- `MEDIA_MODE=embedded`
- optional remote `gif-worker`

The listener is responsible for:

- keeping a persistent Discord Gateway connection alive
- listening for `MESSAGE_CREATE`
- auto-posting preview cards for supported links
- exposing `/healthz` for Render and external keepalive checks

## Recommended Deployment Shape

- Platform: Render Web Service
- Health Check Path: `/healthz`
- External keepalive: UptimeRobot or an equivalent service that periodically requests `GET /healthz`

> [!IMPORTANT]
> Do not hardcode a single service name, region, or production URL into project docs. For an open source project, document deployment principles and validation criteria instead.

## Region Selection Rules

If a region shows any of the following during real tests:

- `restProbe.status = 429`
- response summaries containing `Access denied | discord.com used Cloudflare to restrict ...`

then the issue is usually not the application code. It is more likely the region's outbound path being limited by Discord or Cloudflare.

A good region should satisfy all of the following:

- `ready = true`
- `gatewayPhase = "ready"`
- `restProbe.ok = true`

## Health Check Interpretation

A healthy `/healthz` response should look roughly like this:

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

### Field Notes

- `ready`
  - `true`: Discord Gateway reached `ready`
  - `false`: the listener has not completed login yet
- `gatewayPhase`
  - `ready`: healthy
  - `login_pending`: login started but has not completed yet
  - `login_timeout`: login flow stalled and timed out
  - `login_failed`: token or login failed immediately
  - `shard_disconnected`: the Gateway shard disconnected
- `gatewayLastError`
  - the latest summarized listener error
- `restProbe`
  - `ok = true`: Discord REST probing succeeded
  - `ok = false`: outbound traffic or Discord-side blocking is likely
- `debugMessages`
  - recent Gateway debug lines for heartbeat, identify, and ready diagnostics

## Suggested UptimeRobot Configuration

- Monitor Type: `HTTP(s)`
- Method: `GET`
- URL: `https://<your-render-service>.onrender.com/healthz`
- Interval: `14 minutes`

> [!NOTE]
> A keepalive monitor can reduce cold starts on free services. It cannot solve Discord or Cloudflare blocking a specific region's outbound traffic.

## Deployment Update Flow

### 1. Update the listener code

Main files:

- `worker/gateway-listener/index.ts`
- `worker/gateway-listener/preview-attachments.mjs`
- `src/common/utils/preview-card.ts`
- `src/common/stores/index.ts`

### 2. Push to the branch tracked by Render

The Render Web Service should redeploy automatically from the configured branch.

References:

- [Render Deploys](https://render.com/docs/deploys)
- [Render Web Services](https://render.com/docs/web-services)

### 3. Check `/healthz`

After deployment, verify:

1. `ready = true`
2. `gatewayPhase = "ready"`
3. `restProbe.ok = true`
4. `gatewayLastError = null` or at least not continuously changing

### 4. Verify behavior in Discord

Post new supported links in a guild channel:

- `x.com` / `twitter.com`
- `pixiv.net`
- `bsky.app`

Confirm the bot replies with preview cards.

## Troubleshooting

### Symptom: `login_pending`

The process has called `client.login()` but has not reached `ready`.

Check:

1. `restProbe.ok`
2. `restProbe.status`
3. `debugMessages`
4. Render deploy logs

### Symptom: `login_timeout`

The Discord Gateway login flow stalled.

Prioritize checking:

1. `restProbe.status`
2. `gatewayLastError`
3. whether multiple listener instances are running at the same time

### Symptom: `restProbe.status = 429` with `Access denied`

This usually means the current Render region or egress IP is being blocked by Discord or Cloudflare.

Response:

1. create a new service in another region
2. validate its `/healthz`
3. disable the old listener to avoid duplicate replies

## Operational Notes

- do not leave multiple healthy Gateway listeners active at the same time, or you may send duplicate preview cards
- if another local or cloud listener is still running, shut it down after the primary listener is confirmed healthy
- treat `/healthz` as the primary availability signal, not just the Render dashboard state

## References

- [Render Web Services](https://render.com/docs/web-services)
- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Deploys](https://render.com/docs/deploys)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
