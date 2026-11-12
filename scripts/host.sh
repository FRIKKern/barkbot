#!/bin/sh
# The bot's computer, phase 1: the owner's Mac (S1). One locked folder, ~/BarkBot/home.
#   npm run host:enroll   paste the one-time token from Studio > Chat hosts (it is not echoed)
#   npm run host          run the host; keep this terminal open while the bot works
set -eu
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BIN="$ROOT_DIR/.cache/bin/barkpark-chat-host"
URL="${BARKPARK_URL:-https://guerrilla.barkpark.cloud}"
HOME_DIR="$HOME/BarkBot/home"
STATE="$HOME/.config/barkbot/chat-host.json"
SRC="${BARKPARK_SRC:-$ROOT_DIR/../barkpark}"
mkdir -p "$HOME_DIR" "$(dirname "$STATE")" "$(dirname "$BIN")"
# The host program is built from the Barkpark checkout next door, at origin/main as last fetched
# (not the working tree: another branch or a stale pull must not decide what the bot runs).
# $BIN.commit remembers what it was built from; a newer origin/main rebuilds it.
STAMP="$BIN.commit"
WANT=$(git -C "$SRC" rev-parse --short=10 origin/main 2>/dev/null || true)
HAVE=$(cat "$STAMP" 2>/dev/null || true)
[ -n "$WANT" ] || echo "host: no Barkpark checkout at $SRC (set BARKPARK_SRC); using the host program as built" >&2
if [ -n "$WANT" ] && { [ ! -x "$BIN" ] || [ "$HAVE" != "$WANT" ]; }; then
  TMP=$(mktemp -d "${TMPDIR:-/tmp}/barkbot-host.XXXXXX")
  trap 'rm -rf "$TMP"' EXIT
  git -C "$SRC" archive "$WANT" go.mod go.sum cmd/barkpark-chat-host internal/chathost | tar -x -C "$TMP"
  (cd "$TMP" && go build -o "$BIN" ./cmd/barkpark-chat-host)
  printf '%s\n' "$WANT" > "$STAMP"
  rm -rf "$TMP"; trap - EXIT
  echo "host: built the host program from Barkpark $WANT (was ${HAVE:-none})" >&2
fi
[ -x "$BIN" ] || { echo "host: no host program at $BIN and nothing to build it from" >&2; exit 1; }
echo "host: running the host program built from Barkpark $(cat "$STAMP" 2>/dev/null || echo unknown)" >&2
case "${1:-run}" in
  enroll)
    printf 'One-time enrollment token: '
    stty -echo; read -r TOKEN; stty echo; printf '\n'
    "$BIN" enroll --url "$URL" --token "$TOKEN" --root "$HOME_DIR" --state "$STATE"
    ;;
  run)
    exec "$BIN" run --state "$STATE"
    ;;
  *) echo "usage: host.sh enroll|run" >&2; exit 2 ;;
esac
