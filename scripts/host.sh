#!/bin/sh
# The bot's computer, phase 1: the owner's Mac (S1). One locked folder, ~/BarkBot/home.
#   npm run host:enroll            paste the one-time token from Studio > Chat hosts (not echoed; it reaches the host on stdin)
#   npm run host                   run the host in this terminal; keep it open while the bot works
#   npm run host:install-agent     run the host as a LaunchAgent instead: it starts at login, restarts on failure,
#                                  and needs no terminal (-- --replace stops a host already running in a terminal)
#   npm run host:agent-status      is the LaunchAgent installed, loaded, running; where its logs are
#   npm run host:uninstall-agent   stop the LaunchAgent and remove it
# Tested without launchd by scripts/test-host-agent.sh.
set -eu
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BIN="$ROOT_DIR/.cache/bin/barkpark-chat-host"
URL="${BARKPARK_URL:-https://guerrilla.barkpark.cloud}"
HOME_DIR="$HOME/BarkBot/home"
STATE="$HOME/.config/barkbot/chat-host.json"
SRC="${BARKPARK_SRC:-$ROOT_DIR/../barkpark}"
# The LaunchAgent (the Mac's barkbot-host.service): one per user, named after barkpark.cloud.
LABEL=cloud.barkpark.barkbot.chat-host
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/BarkBot"
CMD="${1:-run}"
STAMP="$BIN.commit"

build() {
mkdir -p "$HOME_DIR" "$(dirname "$STATE")" "$(dirname "$BIN")"
# The host program is built from the Barkpark checkout next door, at origin/main as last fetched
# (not the working tree: another branch or a stale pull must not decide what the bot runs).
# $BIN.commit remembers what it was built from; a newer origin/main rebuilds it.
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
}

# The LaunchAgent's pid, or nothing when it is not loaded or not running.
agent_pid() {
  command -v launchctl >/dev/null 2>&1 || return 0
  launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | awk '$1 == "pid" && $2 == "=" { print $3; exit }' || true
}
# Every host program of this user on this enrollment (its --state), one pid per line, the
# LaunchAgent's own left out. Matched on the whole command line in awk, through the environment,
# so the matcher never finds itself; any checkout's build counts, since they share the state file.
other_hosts() {
  ps -A -o pid=,uid=,command= | P="barkpark-chat-host run --state $STATE" U=$(id -u) A=$(agent_pid) \
    awk 'ENVIRON["U"] != "" && $2 == ENVIRON["U"] "" && $1 != ENVIRON["A"] "" && index($0, ENVIRON["P"]) { print $1 }'
}
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# The plist: the command npm run host execs ($BIN run --state $STATE), from the folder npm runs it
# in. No secret: the enrollment credential stays in $STATE, which the host program reads itself.
# PATH is the installer's, so the host finds claude and bp as it does in a terminal (launchd's own
# PATH is /usr/bin:/bin:/usr/sbin:/sbin).
#  KeepAlive SuccessfulExit=false  restart on a crash or a failed exit, as Restart=on-failure on the VM;
#                                  a clean exit (bootout, a host told to stop) stays stopped
#  ThrottleInterval 10             at most one start every 10 s, so a crash loop does not spin
#  ProcessType Adaptive            not Background: Background caps CPU and I/O for work nobody asked
#                                  for, and every turn is a person waiting on a reply (QUALITY's feel
#                                  budgets). Adaptive lets launchd lift it when it is in use.
plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>$(xml "$BIN")</string>
		<string>run</string>
		<string>--state</string>
		<string>$(xml "$STATE")</string>
	</array>
	<key>WorkingDirectory</key>
	<string>$(xml "$ROOT_DIR")</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>$(xml "$PATH")</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>ProcessType</key>
	<string>Adaptive</string>
	<key>StandardOutPath</key>
	<string>$(xml "$LOGS/chat-host.out.log")</string>
	<key>StandardErrorPath</key>
	<string>$(xml "$LOGS/chat-host.err.log")</string>
</dict>
</plist>
EOF
}

mac_only() {
  [ "$(uname -s)" = Darwin ] || { echo "host: $CMD is for a Mac (launchd); the VM runs barkbot-host.service" >&2; exit 2; }
}

case "$CMD" in
  enroll)
    build
    # The code goes to the host program on stdin (Barkpark #27644), never in its argv, where the
    # process list would show it. Typed at a terminal it is not echoed; it can also be piped in.
    # A host program built before that reader (Barkpark 9df5f9e192) wants --token: it was built from
    # a Barkpark checkout whose origin/main is older, so fetching is what moves it. Said before the
    # code is asked for, so the code is not spent.
    READER=9df5f9e192
    if [ -n "$WANT" ] && [ -s "$STAMP" ]; then
      BUILT=$(cat "$STAMP")
      # Only when both commits are in the checkout: a shallow clone may hold neither, and says nothing.
      if git -C "$SRC" cat-file -e "$READER^{commit}" 2>/dev/null && git -C "$SRC" cat-file -e "$BUILT^{commit}" 2>/dev/null &&
         ! git -C "$SRC" merge-base --is-ancestor "$READER" "$BUILT" 2>/dev/null; then
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
    # One host per enrollment: a second one would race the first for the same turns.
    if [ -n "$(agent_pid)" ]; then
      echo "host: the host already runs as the LaunchAgent $LABEL (npm run host:agent-status); npm run host:uninstall-agent to run it here instead" >&2
      exit 1
    fi
    RUNNING=$(other_hosts | tr '\n' ' ')
    [ -z "$RUNNING" ] || { echo "host: a host is already running on this enrollment (pid $RUNNING); stop it first" >&2; exit 1; }
    build
    exec "$BIN" run --state "$STATE"
    ;;
  install-agent)
    mac_only
    REPLACE=
    case "${2:-}" in --replace) REPLACE=1 ;; '') ;; *) echo "usage: host.sh install-agent [--replace]" >&2; exit 2 ;; esac
    [ -s "$STATE" ] || { echo "host: this Mac is not enrolled ($STATE is missing); npm run host:enroll first" >&2; exit 1; }
    # A host in a terminal (npm run host) is stopped only when asked: it may be in the middle of a reply.
    RUNNING=$(other_hosts | tr '\n' ' ')
    if [ -n "$RUNNING" ]; then
      if [ -z "$REPLACE" ]; then
        echo "host: a host is already running outside the LaunchAgent (pid $RUNNING), likely npm run host in a terminal." >&2
        echo "host: stop it, or run npm run host:install-agent -- --replace to stop it and install the LaunchAgent." >&2
        exit 1
      fi
      echo "host: stopping the host already running (pid $RUNNING)" >&2
      # shellcheck disable=SC2086 # one pid per word
      kill $RUNNING 2>/dev/null || true
      i=0
      while [ -n "$(other_hosts)" ]; do
        i=$((i + 1))
        [ "$i" -le 20 ] || { echo "host: pid $(other_hosts | tr '\n' ' ')did not stop within 10 s; nothing installed" >&2; exit 1; }
        sleep 0.5
      done
    fi
    build
    mkdir -p "$(dirname "$PLIST")" "$LOGS"
    NEW="$PLIST.new.$$"
    plist > "$NEW"
    plutil -lint -s "$NEW" >/dev/null || { rm -f "$NEW"; echo "host: the generated plist does not lint; nothing installed" >&2; exit 1; }
    DOMAIN="gui/$(id -u)"
    LOADED=
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 && LOADED=1
    if [ -n "$LOADED" ] && [ -f "$PLIST" ] && cmp -s "$NEW" "$PLIST"; then
      rm -f "$NEW"
      echo "host: the LaunchAgent $LABEL is already installed and loaded, unchanged. To restart it on a rebuilt host program: launchctl kickstart -k $DOMAIN/$LABEL" >&2
      exit 0
    fi
    # Changed or not loaded: unload what is there, put the new plist in place, load it.
    [ -z "$LOADED" ] || launchctl bootout "$DOMAIN/$LABEL" || { rm -f "$NEW"; echo "host: could not unload the old LaunchAgent; nothing changed" >&2; exit 1; }
    mv "$NEW" "$PLIST"
    launchctl enable "$DOMAIN/$LABEL" || true # a launchctl disable would otherwise outlive the reinstall
    launchctl bootstrap "$DOMAIN" "$PLIST" || { echo "host: launchctl bootstrap $DOMAIN $PLIST failed; the plist is in place, see npm run host:agent-status" >&2; exit 1; }
    echo "host: installed and loaded the LaunchAgent $LABEL: it starts at login and restarts on failure. Logs: $LOGS/chat-host.{out,err}.log" >&2
    ;;
  uninstall-agent)
    mac_only
    DOMAIN="gui/$(id -u)"
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      launchctl bootout "$DOMAIN/$LABEL" || { echo "host: could not unload the LaunchAgent $LABEL; the plist is kept" >&2; exit 1; }
      echo "host: unloaded the LaunchAgent $LABEL" >&2
    fi
    if [ -f "$PLIST" ]; then rm -f "$PLIST"; echo "host: removed $PLIST" >&2
    else echo "host: no LaunchAgent plist at $PLIST" >&2; fi
    ;;
  agent-status)
    mac_only
    DOMAIN="gui/$(id -u)"
    [ -f "$PLIST" ] && echo "plist:   $PLIST" || echo "plist:   none (npm run host:install-agent)"
    if INFO=$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null); then
      echo "loaded:  $DOMAIN/$LABEL"
      printf '%s\n' "$INFO" | awk '$2 == "=" && ($1 == "state" || $1 == "pid" || $0 ~ /last exit code/) { sub(/^[ \t]+/, ""); print "         " $0 }'
    else
      echo "loaded:  no"
    fi
    RUNNING=$(other_hosts | tr '\n' ' ')
    [ -z "$RUNNING" ] || echo "also:    a host outside the LaunchAgent (pid $RUNNING)"
    echo "logs:    $LOGS/chat-host.out.log, $LOGS/chat-host.err.log"
    ;;
  *) echo "usage: host.sh enroll|run|install-agent [--replace]|uninstall-agent|agent-status" >&2; exit 2 ;;
esac
