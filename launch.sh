#!/usr/bin/env bash
# launch.sh — Production-grade local deployment for evokernel-spec.
#
# Goal: a single command that, on a fresh `git clone`, gets the site
# serving on http://127.0.0.1:4321 with full readiness verification.
#
# Pipeline:
#   1. install deps (pnpm)
#   2. validate data (zod schemas + cross-refs)
#   3. build (yields apps/web/dist/, 237+ pages)
#   4. start preview server detached (logs → .runtime/preview.log)
#   5. poll /api/health.json until status:ok (timeout 30s)
#   6. smoke-check 5 critical routes return 200
#   7. print live URL + stop instructions
#
# Idempotent: kills any existing 4321 listener before relaunch.
# Safe: never runs as root, never opens external ports unprompted.

set -euo pipefail

PORT="${PORT:-4321}"
HOST="${HOST:-127.0.0.1}"
RUNTIME_DIR=".runtime"
LOG_FILE="${RUNTIME_DIR}/preview.log"
PID_FILE="${RUNTIME_DIR}/preview.pid"
HEALTH_TIMEOUT_S=30
HEALTH_POLL_INTERVAL_S=1

mkdir -p "$RUNTIME_DIR"

# ANSI colors
b="\033[1m"; g="\033[32m"; y="\033[33m"; r="\033[31m"; n="\033[0m"

log()  { printf "%b[launch]%b %s\n" "$b" "$n" "$1"; }
ok()   { printf "%b[ ok ]%b %s\n"   "$g" "$n" "$1"; }
warn() { printf "%b[warn]%b %s\n"   "$y" "$n" "$1"; }
fail() { printf "%b[fail]%b %s\n"   "$r" "$n" "$1"; exit 1; }

# ---- flags ----
SKIP_BUILD=0
SKIP_VALIDATE=0
for arg in "$@"; do
  case "$arg" in
    --stop)
      log "stopping evokernel-spec preview"
      if [[ -f "$PID_FILE" ]]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
          kill "$pid" && ok "killed pid $pid"
        else
          warn "pid $pid not running (stale pid file)"
        fi
        rm -f "$PID_FILE"
      fi
      # Catch any orphaned listeners on port too
      orphan=$(lsof -i ":$PORT" -t 2>/dev/null || true)
      [[ -n "$orphan" ]] && kill "$orphan" 2>/dev/null && ok "cleaned up orphan pid $orphan"
      exit 0
      ;;
    --no-build) SKIP_BUILD=1 ;;
    --no-validate) SKIP_VALIDATE=1 ;;
    --help|-h)
      cat <<EOF
launch.sh — production-grade local deployment for evokernel-spec

Usage:
  ./launch.sh                   build + start + health-check
  ./launch.sh --no-build        skip build (use existing dist/)
  ./launch.sh --no-validate     skip data validation
  ./launch.sh --stop            stop the running preview
  ./launch.sh --help            this message

Environment:
  PORT=4321                     server port
  HOST=127.0.0.1                bind address (use 0.0.0.0 to expose LAN)
EOF
      exit 0 ;;
    *) warn "unknown flag: $arg (use --help)" ;;
  esac
done

# ---- 0. kill anything already listening on $PORT ----
log "checking port :$PORT"
existing=$(lsof -i ":$PORT" -t 2>/dev/null || true)
if [[ -n "$existing" ]]; then
  warn "port $PORT busy (pid $existing) — killing it"
  kill "$existing" 2>/dev/null || true
  sleep 1
fi

# ---- 1. install ----
if [[ ! -d node_modules ]]; then
  log "installing dependencies via pnpm"
  pnpm install --silent
else
  log "deps cached (node_modules present)"
fi

# ---- 2. validate ----
if [[ $SKIP_VALIDATE -eq 1 ]]; then
  warn "skipping data validation (--no-validate)"
else
  log "validating data corpus"
  if ! pnpm validate >"${RUNTIME_DIR}/validate.log" 2>&1; then
    cat "${RUNTIME_DIR}/validate.log"
    fail "data validation failed — see ${RUNTIME_DIR}/validate.log"
  fi
  ok "data corpus valid"
fi

# ---- 3. build ----
if [[ $SKIP_BUILD -eq 1 && -d apps/web/dist ]]; then
  warn "skipping build (--no-build), using existing apps/web/dist/"
  pages_built="cached"
else
  log "building static site (this takes ~5-10s)"
  if ! pnpm build >"${RUNTIME_DIR}/build.log" 2>&1; then
    tail -40 "${RUNTIME_DIR}/build.log"
    fail "build failed — see ${RUNTIME_DIR}/build.log"
  fi
  pages_built=$(grep -oE '[0-9]+ page\(s\) built' "${RUNTIME_DIR}/build.log" | head -1 || echo "?")
  ok "build complete — $pages_built"
fi

# ---- 4. start preview detached ----
log "starting preview server detached → $LOG_FILE"
(
  cd apps/web
  exec pnpm preview --port "$PORT" --host "$HOST" >"../../$LOG_FILE" 2>&1
) &
echo $! > "$PID_FILE"
preview_pid=$(cat "$PID_FILE")
ok "preview started (pid $preview_pid)"

# ---- 5. poll health endpoint ----
log "waiting for /api/health.json (timeout ${HEALTH_TIMEOUT_S}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_S ))
healthy=0
while [[ $(date +%s) -lt $deadline ]]; do
  if response=$(curl -sf --max-time 2 "http://${HOST}:${PORT}/api/health.json" 2>/dev/null); then
    if echo "$response" | grep -q '"status": "ok"'; then
      healthy=1
      break
    fi
  fi
  sleep "$HEALTH_POLL_INTERVAL_S"
done

if [[ $healthy -ne 1 ]]; then
  warn "health endpoint did not become healthy in ${HEALTH_TIMEOUT_S}s"
  warn "tail of $LOG_FILE:"
  tail -20 "$LOG_FILE" || true
  fail "preview unhealthy"
fi
ok "health probe passing (HTTP 200, status:ok)"

# ---- 6. smoke-check critical routes ----
log "smoke-checking critical routes"
routes=(/ /hardware/ /models/ /cases/ /calculator/ /pricing/ /china/ /en/)
failed_routes=()
for route in "${routes[@]}"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 3 "http://${HOST}:${PORT}${route}" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    printf "  %b✓%b %s → 200\n" "$g" "$n" "$route"
  else
    printf "  %b✗%b %s → %s\n" "$r" "$n" "$route" "$code"
    failed_routes+=("$route")
  fi
done

if [[ ${#failed_routes[@]} -gt 0 ]]; then
  fail "${#failed_routes[@]} routes failed: ${failed_routes[*]}"
fi
ok "all ${#routes[@]} critical routes responding"

# ---- 7. show summary ----
sha=$(echo "$response" | grep -oE '"sha": "[^"]*"' | head -1 | sed 's/.*"sha": "\([^"]*\)"/\1/')
counts=$(echo "$response" | grep -oE '"hardware": [0-9]+' | head -1 | grep -oE '[0-9]+')

printf "\n%b━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%b\n" "$b" "$n"
printf "  %b✓%b  evokernel-spec is %bLIVE%b\n\n" "$g" "$n" "$b" "$n"
printf "  URL:        http://%s:%s/\n" "$HOST" "$PORT"
printf "  Health:     http://%s:%s/api/health.json\n" "$HOST" "$PORT"
printf "  Build SHA:  %s\n" "${sha:-unknown}"
printf "  Pages:      %s\n" "${pages_built:-unknown}"
printf "  Hardware:   %s cards loaded\n\n" "${counts:-unknown}"
printf "  Logs:       tail -f %s\n" "$LOG_FILE"
printf "  Stop:       ./launch.sh --stop  (or kill %s)\n" "$preview_pid"
printf "%b━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%b\n\n" "$b" "$n"
