#!/bin/bash
#
# Local Web Enjoy, started and stopped without a terminal to keep open.
#
# `yarn workspace enjoy web` is two Vite dev servers in the foreground, which is
# the right shape for developing and the wrong one for using: the window has to
# stay open, and closing it is the only way to stop. This wraps that command so
# it can be started from the Finder, found again when it is already running, and
# stopped on purpose.
#
#   start   start it if it is not up, then wait until it answers
#   open    start if needed, then open the browser at it
#   stop    stop both servers
#   status  say whether it is up, and exit non-zero when it is not
#
# `ENJOY_NODE_BIN` overrides where node is looked for, which is the one thing
# that differs between machines.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$HOME/Library/Logs/enjoy-local-web.log"

# The two ports `yarn workspace enjoy web` listens on: the local server, and the
# frontend that proxies to it. The frontend is the one a browser wants.
SERVER_PORT="${ENJOY_WEB_PORT:-7100}"
UI_PORT="${ENJOY_WEB_UI_PORT:-7101}"
UI_URL="http://127.0.0.1:$UI_PORT"

# How long to wait for two Vite dev servers to come up from cold, in seconds.
# Generous on purpose: waiting a few seconds too long is invisible, and opening
# the browser too early shows a connection error the user has to reload past.
READY_TIMEOUT=90

# Where node might be, in the order worth trying. A bundle launched from the
# Finder gets none of the shell's PATH, so the version managers have to be
# looked for by hand rather than assumed to have been set up already.
node_bin() {
  if [ -n "${ENJOY_NODE_BIN:-}" ]; then
    echo "$ENJOY_NODE_BIN"
    return
  fi

  local candidate
  for candidate in \
    "$(command -v node 2>/dev/null)" \
    "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)" \
    "$HOME/.local/share/fnm/aliases/default/bin/node" \
    "$HOME/.volta/bin/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node
  do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return; }
  done
}

listening_on() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null
}

# Up means the frontend answers, not merely that something holds the port: a
# half-started Vite is listening well before it will serve anything.
is_up() {
  curl -sfo /dev/null --max-time 2 "$UI_URL" 2>/dev/null
}

note() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

# Reports failures where someone launching from the Finder will see them, since
# there is no terminal for a message to land in.
fail() {
  note "$1"
  osascript -e "display alert \"Enjoy\" message \"$1\" as critical" >/dev/null 2>&1
  exit 1
}

start() {
  if is_up; then
    return 0
  fi

  local node
  node="$(node_bin)"
  [ -n "$node" ] || fail "找不到 node。装一个，或设置 ENJOY_NODE_BIN 指向它。"

  # Whatever is left of a previous run: a Vite that is listening but no longer
  # answering would otherwise make the new one fail on a taken port.
  stop_quietly

  mkdir -p "$(dirname "$LOG")"
  note "starting: $node $REPO/.yarn/releases/yarn-4.6.0.cjs workspace enjoy web"

  # Yarn is run through the release the repository pins, so that a yarn on PATH
  # is one more thing that does not have to be there.
  (
    cd "$REPO" || exit 1
    PATH="$(dirname "$node"):$PATH" \
      nohup "$node" "$REPO/.yarn/releases/yarn-4.6.0.cjs" workspace enjoy web \
      >> "$LOG" 2>&1 &
  )

  local waited=0
  while [ "$waited" -lt "$READY_TIMEOUT" ]; do
    is_up && { note "up at $UI_URL after ${waited}s"; return 0; }
    sleep 1
    waited=$((waited + 1))
  done

  fail "Enjoy 启动超时（${READY_TIMEOUT}秒）。日志：$LOG"
}

stop_quietly() {
  local pids
  pids="$(listening_on "$UI_PORT"; listening_on "$SERVER_PORT")"
  [ -n "$pids" ] || return 0

  # shellcheck disable=SC2086
  kill $pids 2>/dev/null

  local waited=0
  while [ "$waited" -lt 10 ]; do
    pids="$(listening_on "$UI_PORT"; listening_on "$SERVER_PORT")"
    [ -n "$pids" ] || return 0
    sleep 1
    waited=$((waited + 1))
  done

  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null
}

case "${1:-open}" in
  start)
    start
    ;;
  open)
    start && open "$UI_URL"
    ;;
  stop)
    stop_quietly
    note "stopped"
    ;;
  status)
    if is_up; then
      echo "Local Web Enjoy 正在运行：$UI_URL"
    else
      echo "Local Web Enjoy 没有运行"
      exit 1
    fi
    ;;
  *)
    echo "用法: $(basename "$0") [start|open|stop|status]" >&2
    exit 2
    ;;
esac
