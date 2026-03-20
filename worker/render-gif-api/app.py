import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

APP_NAME = "discord-media-gif-api"
ARTIFACT_DIR = Path("/tmp/discord-media-gif")
FFMPEG_TIMEOUT_SEC = int(os.getenv("FFMPEG_TIMEOUT_SEC", "45"))
MAX_GIF_DURATION_SEC = int(os.getenv("MAX_GIF_DURATION_SEC", "12"))
GIF_SCALE_WIDTH = int(os.getenv("GIF_SCALE_WIDTH", "480"))
GIF_FPS = int(os.getenv("GIF_FPS", "12"))

app = FastAPI(title=APP_NAME)


class GifRequest(BaseModel):
    channelId: Optional[str] = None
    guildId: Optional[str] = None
    mediaUrl: str
    requesterId: Optional[str] = None
    sourceUrl: Optional[str] = None


def get_auth_token() -> Optional[str]:
    value = os.getenv("GIF_API_TOKEN")
    return value.strip() if value else None


def ensure_authorized(authorization: Optional[str]) -> None:
    expected = get_auth_token()

    if not expected:
        return

    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def ensure_artifact_dir() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def normalize_media_url(value: str) -> str:
    normalized = value.strip()

    if not normalized.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="mediaUrl must be http or https"
        )

    return normalized


def build_artifact_url(request: Request, artifact_name: str) -> str:
    return str(request.base_url).rstrip("/") + f"/artifacts/{artifact_name}"


def convert_to_gif(media_url: str, output_path: Path) -> None:
    ffmpeg_path = shutil.which("ffmpeg")

    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="ffmpeg is not installed")

    palette_path = output_path.with_suffix(".png")

    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                media_url,
                "-vf",
                f"fps={GIF_FPS},scale={GIF_SCALE_WIDTH}:-1:flags=lanczos,palettegen",
                str(palette_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_SEC,
        )

        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-ss",
                "0",
                "-t",
                str(MAX_GIF_DURATION_SEC),
                "-i",
                media_url,
                "-i",
                str(palette_path),
                "-lavfi",
                f"fps={GIF_FPS},scale={GIF_SCALE_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired as error:
        raise HTTPException(
            status_code=504,
            detail="GIF conversion timed out",
        ) from error
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        raise HTTPException(
            status_code=502,
            detail=stderr or "ffmpeg failed to convert media",
        ) from error
    finally:
        palette_path.unlink(missing_ok=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/artifacts/{artifact_name}")
def get_artifact(artifact_name: str):
    file_path = ARTIFACT_DIR / artifact_name

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    return FileResponse(file_path, media_type="image/gif")


@app.post("/v1/gif")
def create_gif(
    body: GifRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    ensure_authorized(authorization)
    ensure_artifact_dir()

    media_url = normalize_media_url(body.mediaUrl)
    artifact_name = f"{uuid.uuid4().hex}.gif"
    artifact_path = ARTIFACT_DIR / artifact_name

    convert_to_gif(media_url, artifact_path)

    return {
        "expiresAt": None,
        "gifUrl": build_artifact_url(request, artifact_name),
        "message": None,
        "provider": "render-gif",
        "status": "ready",
    }
