# Render GIF API

This service is the GIF conversion backend for `worker/cloudflare-media-proxy`.

Endpoints:

- `GET /health`
- `GET /artifacts/{artifact_name}`
- `POST /v1/gif`

## Request Body

```json
{
  "mediaUrl": "https://cdn.example/video.mp4"
}
```

## Success Response

```json
{
  "status": "ready",
  "provider": "render-gif",
  "gifUrl": "https://<service>.onrender.com/artifacts/<id>.gif",
  "expiresAt": null,
  "message": null
}
```

## Environment Variables

- `GIF_API_TOKEN` (optional but recommended): bearer token required by the service
- `FFMPEG_TIMEOUT_SEC` (optional, default `45`)
- `MAX_GIF_DURATION_SEC` (optional, default `12`)
- `GIF_SCALE_WIDTH` (optional, default `480`)
- `GIF_FPS` (optional, default `12`)

## Local Run

```bash
cd worker/render-fallback-api
docker build -t render-gif-api .
docker run --rm -p 10000:10000 \
  -e GIF_API_TOKEN=your-token \
  render-gif-api
```

## Render Deploy

1. Create a new Render **Web Service**
2. Root directory: `worker/render-fallback-api`
3. Runtime: **Docker**
4. Set `GIF_API_TOKEN`
5. Deploy and verify `GET /health`

## Connect to Cloudflare Worker

Set these in `worker/cloudflare-media-proxy`:

- `GIF_API_BASE_URL=https://<render-service>.onrender.com`
- `GIF_API_TOKEN=<same token>`
