#!/bin/sh
# The bot's computer, phase 1: the owner's Mac (S1). One locked folder, ~/BarkBot/home.
#   npm run host:enroll   paste the one-time token from Studio > Chat hosts (not echoed; it reaches the host on stdin)
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
  # All of internal/, not a list of packages: the host imports more of it over time
  # (internal/textcut arrived in Barkpark b5ce2e033a), and a missed one fails the build.
  # A failed build keeps the program that works, so a restart never takes the host down.
  if git -C "$SRC" archive "$WANT" go.mod go.sum cmd/barkpark-chat-host internal | tar -x -C "$TMP" &&
     (cd "$TMP" && go build -o "$BIN.next" ./cmd/barkpark-chat-host); then
    mv "$BIN.next" "$BIN"
    printf '%s\n' "$WANT" > "$STAMP"
    echo "host: built the host program from Barkpark $WANT (was ${HAVE:-none})" >&2
  else
    rm -f "$BIN.next"
    echo "host: could not build the host program from Barkpark $WANT; keeping the one built from ${HAVE:-none}" >&2
  fi
  rm -rf "$TMP"; trap - EXIT
fi
[ -x "$BIN" ] || { echo "host: no host program at $BIN and nothing to build it from" >&2; exit 1; }
echo "host: running the host program built from Barkpark $(cat "$STAMP" 2>/dev/null || echo unknown)" >&2
case "${1:-run}" in
  enroll)
    # The code goes to the host program on stdin (Barkpark #27644), never in its argv, where the
    # process list would show it. Typed at a terminal it is not echoed; it can also be piped in.
    # A host program built before that reader (Barkpark 9df5f9e192) wants --token: it was built from
    # a Barkpark checkout whose origin/main is older, so fetching is what moves it. Said before the
    # code is asked for, so the code is not spent.
    READER=9df5f9e192
    if [ -n "$WANT" ] && [ -s "$STAMP" ]; then
      BUILT=$(cat "$STAMP")
      if git -C "$SRC" cat-file -e "$BUILT^{commit}" 2>/dev/null && ! git -C "$SRC" merge-base --is-ancestor "$READER" "$BUILT" 2>/dev/null; then
        echo "host: the host program was built from Barkpark $BUILT, which predates its stdin reader ($READER, #27644)." >&2
        echo "host: fetch Barkpark (git -C \"$SRC\" fetch origin), then run npm run host:enroll again: it rebuilds first." >&2
        exit 1
      fi
    fi
    printf 'One-time enrollment token: '
    # read fails at the end of input with no newline (a code piped from pbpaste) but keeps what it read.
    if [ -t 0 ]; then
      trap 'stty echo; printf "\n"; exit 130' INT HUP TERM # Ctrl-C in the hidden read gives echo back
      stty -echo; read -r TOKEN || [ -n "${TOKEN:-}" ] || TOKEN=; stty echo
      trap - INT HUP TERM; printf '\n'
    else
      read -r TOKEN || [ -n "${TOKEN:-}" ] || TOKEN=
    fi
    [ -n "$TOKEN" ] || { echo "host: no enrollment code given" >&2; exit 1; }
    if ! printf '%s\n' "$TOKEN" | "$BIN" enroll --url "$URL" --root "$HOME_DIR" --state "$STATE"; then
      echo "host: enrollment failed. If it asked for --token, the host program predates Barkpark's stdin reader: git -C \"$SRC\" fetch origin, then npm run host:enroll again." >&2
      exit 1
    fi
    ;;
  run)
    exec "$BIN" run --state "$STATE"
    ;;
  *) echo "usage: host.sh enroll|run" >&2; exit 2 ;;
esac
