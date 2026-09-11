#!/usr/bin/env bash
#
# Music X — start the backend and the frontend together.
#
#   ./run.sh              API on :8000, then Expo (press w for web)
#   ./run.sh --web        the same, opening the browser straight away
#   ./run.sh --api-logs   also stream the backend log inline
#
# One Ctrl+C stops both.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_PORT=8000
API_LOG="$ROOT/backend/.dev-api.log"
UVICORN="$ROOT/backend/.venv/bin/uvicorn"

dim=$(printf '\033[2m');  red=$(printf '\033[31m'); grn=$(printf '\033[32m')
ylw=$(printf '\033[33m'); mag=$(printf '\033[35m'); cyn=$(printf '\033[36m')
off=$(printf '\033[0m')
say() { printf '%s\n' "${cyn}[run]${off} $*"; }
die() { printf '%s\n' "${red}[run]${off} $*" >&2; exit 1; }

STREAM_LOGS=0
EXPO_ARGS=""
for a in "$@"; do
  case "$a" in
    --api-logs) STREAM_LOGS=1 ;;
    *)          EXPO_ARGS="$EXPO_ARGS $a" ;;
  esac
done

# ---- check everything before starting anything ------------------------------
[ -x "$UVICORN" ] || die "no uvicorn at backend/.venv/bin/uvicorn. Build the venv first:
       python3.12 -m venv backend/.venv
       backend/.venv/bin/pip install -r backend/requirements.txt"

[ -f "$ROOT/backend/.env" ] || die "backend/.env is missing — the API has no database URL without it."

# A leftover backend holds the port and a second uvicorn dies on a line you never
# see. If one is already answering, use it rather than fighting it.
REUSE=0
if lsof -ti "tcp:$API_PORT" >/dev/null 2>&1; then
  if curl -fsS -m 2 "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
    say "an API is already answering on :$API_PORT — leaving that one running"
    REUSE=1
  else
    die "port $API_PORT is busy but nothing answers /health.
       What is it:  lsof -i tcp:$API_PORT
       Stop it:     kill \$(lsof -ti tcp:$API_PORT)"
  fi
fi

# ---- one Ctrl+C stops both ---------------------------------------------------
API_PID=""
TAIL_PID=""
cleanup() {
  trap - INT TERM EXIT
  [ -n "$TAIL_PID" ] && kill "$TAIL_PID" 2>/dev/null
  if [ -n "$API_PID" ]; then
    say "stopping the API…"
    kill "$API_PID" 2>/dev/null
    wait "$API_PID" 2>/dev/null
  fi
}
trap cleanup INT TERM EXIT

# ---- backend -----------------------------------------------------------------
if [ "$REUSE" -eq 0 ]; then
  # --host 0.0.0.0, not uvicorn's default 127.0.0.1: on a phone the app builds its
  # API URL from the Metro host (frontend/src/lib/api.ts), so a loopback-only bind
  # refuses the phone while web keeps working — which reads as a broken app.
  say "starting the API on :$API_PORT ${dim}(log: backend/.dev-api.log)${off}"
  cd "$ROOT/backend" || die "no backend/ directory"
  : > "$API_LOG"
  "$UVICORN" app.main:app --reload --host 0.0.0.0 --port "$API_PORT" >>"$API_LOG" 2>&1 &
  API_PID=$!

  # Wait for a real answer instead of assuming. A backend that dies on import — a bad
  # migration, a missing key — would otherwise leave Expo talking to nothing, and every
  # screen just shows no data.
  say "waiting for the API to answer…"
  up=0
  for _ in $(seq 1 40); do
    kill -0 "$API_PID" 2>/dev/null || break
    if curl -fsS -m 1 "http://localhost:$API_PORT/health" >/dev/null 2>&1; then up=1; break; fi
    sleep 0.5
  done

  if [ "$up" -ne 1 ]; then
    printf '%s\n' "${red}[run]${off} the API never came up. End of backend/.dev-api.log:"
    tail -n 25 "$API_LOG"
    exit 1
  fi
  printf '%s\n' "${grn}[api]${off} up — http://localhost:$API_PORT/docs"

  if [ "$STREAM_LOGS" -eq 1 ]; then
    tail -f "$API_LOG" | sed "s/^/${mag}[api]${off} /" &
    TAIL_PID=$!
  fi
fi

# ---- frontend, in front so Expo keeps the keyboard ---------------------------
# Expo's dev server is interactive: w opens web, r reloads, j the debugger. Piping or
# backgrounding it takes the TTY and those keys stop working, so Expo runs in the
# foreground and the API runs behind it.
say "starting Expo — press ${ylw}w${off} for web, ${ylw}Ctrl+C${off} to stop both"
cd "$ROOT/frontend" || die "no frontend/ directory"
npx expo start $EXPO_ARGS
