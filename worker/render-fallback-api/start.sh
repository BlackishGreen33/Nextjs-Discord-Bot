#!/usr/bin/env bash
set -euo pipefail

exec uvicorn app:app --host 0.0.0.0 --port "${PORT:-10000}"
