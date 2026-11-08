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
if [ ! -x "$BIN" ]; then (cd "$SRC" && go build -o "$BIN" ./cmd/barkpark-chat-host); fi
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
