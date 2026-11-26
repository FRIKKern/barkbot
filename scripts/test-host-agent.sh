#!/bin/sh
# scripts/host.sh install-agent, uninstall-agent, agent-status and the one-host rule, without launchd:
# a copy of host.sh in a scratch folder, a scratch HOME, a stand-in host program, and a stand-in
# launchctl on PATH that writes down every call. Never touches the real ~/Library/LaunchAgents,
# the real launchctl, or a real host (the hosts it looks for are those on the scratch HOME's state).
# macOS only (plutil, ps -o). Run: sh scripts/test-host-agent.sh
set -u
[ "$(uname -s)" = Darwin ] || { echo "✗ test-host-agent needs macOS (plutil, launchd's plist); checked nothing" >&2; exit 1; }
REPO=$(cd "$(dirname "$0")/.." && pwd)
T=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/barkbot-agent-test.XXXXXX")" && pwd)
LABEL=cloud.barkpark.barkbot.chat-host
REAL_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REAL_BEFORE=$( [ -e "$REAL_PLIST" ] && echo there || echo absent )
DUMMIES=
cleanup() { for p in $DUMMIES; do kill "$p" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT INT TERM

FAILS=0 PASSES=0
ok() { PASSES=$((PASSES + 1)); }
no() { FAILS=$((FAILS + 1)); echo "✗ $1" >&2; }
check() { if eval "$2"; then ok; else no "$1"; fi; }

MAC="$T/mac" H="$T/home" FAKE="$T/fake"
mkdir -p "$MAC/scripts" "$MAC/.cache/bin" "$H/.config/barkbot" "$FAKE/bin" "$T/dummy"
cp "$REPO/scripts/host.sh" "$MAC/scripts/host.sh"
printf '#!/bin/sh\nexit 0\n' > "$MAC/.cache/bin/barkpark-chat-host"; chmod 755 "$MAC/.cache/bin/barkpark-chat-host"
STATE="$H/.config/barkbot/chat-host.json"
SECRET="made-up-credential-$$"
printf '{"credential":"%s"}\n' "$SECRET" > "$STATE"
PLIST="$H/Library/LaunchAgents/$LABEL.plist"
U=$(id -u)

# The stand-in launchctl: loaded while $FAKE/loaded exists; print shows pid from $FAKE/pid.
cat > "$FAKE/bin/launchctl" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$FAKE/calls"
case "\$1" in
  print) [ -e "$FAKE/loaded" ] || exit 113
         echo "gui/$U/$LABEL = {"; echo "	state = running"
         [ -s "$FAKE/pid" ] && echo "	pid = \$(cat "$FAKE/pid")"
         echo "	last exit code = (never exited)"; echo "}" ;;
  bootstrap) [ -e "$FAKE/loaded" ] && exit 5; : > "$FAKE/loaded" ;;
  bootout) [ -e "$FAKE/loaded" ] || exit 3; rm -f "$FAKE/loaded" "$FAKE/pid" ;;
  enable) ;;
  *) exit 64 ;;
esac
EOF
chmod 755 "$FAKE/bin/launchctl"

host() { # host.sh <args>, output in $T/out, launchctl calls of this run only in $FAKE/calls
  : > "$FAKE/calls"
  HOME="$H" BARKPARK_SRC="$T/no-barkpark" PATH="$FAKE/bin:${EXTRA_PATH:-}/usr/bin:/bin:/usr/sbin:/sbin" \
    sh "$MAC/scripts/host.sh" "$@" > "$T/out" 2>&1
}
calls() { cat "$FAKE/calls"; }
# What changed launchd: every call but print (host.sh also prints to find the agent's pid).
acts() { grep -v '^print ' "$FAKE/calls"; }
looked() { grep -qx "print gui/$U/$LABEL" "$FAKE/calls"; }
# A host program in a terminal: named like the host, on the scratch enrollment. Its parent exits,
# so launchd reaps it when it is stopped.
dummy() {
  printf '#!/bin/sh\nwhile :; do sleep 1; done\n' > "$T/dummy/barkpark-chat-host"; chmod 755 "$T/dummy/barkpark-chat-host"
  ( "$T/dummy/barkpark-chat-host" run --state "$STATE" >/dev/null 2>&1 & echo $! > "$T/dummy.pid" )
  D=$(cat "$T/dummy.pid"); DUMMIES="$DUMMIES $D"
  i=0; while ! ps -p "$D" -o command= | grep -q 'barkpark-chat-host run'; do i=$((i + 1)); [ $i -lt 50 ] || break; sleep 0.1; done
}
alive() { kill -0 "$1" 2>/dev/null; }

# 1. Not enrolled: nothing installed, launchctl not asked to load.
mv "$STATE" "$STATE.away"
host install-agent; RC=$?
check "install-agent without enrollment exits 1 (got $RC)" '[ $RC -eq 1 ]'
check "install-agent without enrollment writes no plist" '[ ! -e "$PLIST" ]'
check "install-agent without enrollment calls no bootstrap" '! grep -q bootstrap "$FAKE/calls"'
mv "$STATE.away" "$STATE"

# 2. A fresh install: lints, no secret, the host's own command, bootstrap into gui/<uid>.
host install-agent; RC=$?
check "install-agent exits 0 (got $RC: $(tail -1 "$T/out"))" '[ $RC -eq 0 ]'
check "the plist is in the scratch HOME" '[ -f "$PLIST" ]'
check "plutil -lint passes on the plist" 'plutil -lint -s "$PLIST"'
check "launchctl: print, then only enable and bootstrap gui/$U <plist> (got: $(calls | tr '\n' ';'))" \
  'looked && [ "$(acts)" = "$(printf "enable gui/%s/%s\nbootstrap gui/%s %s" "$U" "$LABEL" "$U" "$PLIST")" ]'
check "the plist carries no secret" '! grep -q "$SECRET" "$PLIST"'
P() { plutil -extract "$1" raw -o - "$PLIST" 2>/dev/null; }
check "Label is $LABEL" '[ "$(P Label)" = "$LABEL" ]'
check "it runs the built host program: run --state <state>" \
  '[ "$(P ProgramArguments.0)" = "$MAC/.cache/bin/barkpark-chat-host" ] && [ "$(P ProgramArguments.1)" = run ] && [ "$(P ProgramArguments.2)" = --state ] && [ "$(P ProgramArguments.3)" = "$STATE" ] && [ "$(plutil -extract ProgramArguments raw -o - "$PLIST")" = 4 ]'
check "it runs where npm run host does (the checkout)" '[ "$(P WorkingDirectory)" = "$MAC" ]'
check "PATH is the installer's, so claude and bp are found" 'P EnvironmentVariables.PATH | grep -q "^$FAKE/bin:"'
check "RunAtLoad true" '[ "$(P RunAtLoad)" = true ]'
check "KeepAlive restarts on failure only (SuccessfulExit false)" '[ "$(P KeepAlive.SuccessfulExit)" = false ]'
check "ThrottleInterval 10" '[ "$(P ThrottleInterval)" = 10 ]'
check "ProcessType Adaptive" '[ "$(P ProcessType)" = Adaptive ]'
check "logs go to ~/Library/Logs/BarkBot/chat-host.{out,err}.log" \
  '[ "$(P StandardOutPath)" = "$H/Library/Logs/BarkBot/chat-host.out.log" ] && [ "$(P StandardErrorPath)" = "$H/Library/Logs/BarkBot/chat-host.err.log" ] && [ -d "$H/Library/Logs/BarkBot" ]'
cp "$PLIST" "$T/first.plist"

# 3. Again, unchanged: a no-op, nothing unloaded or loaded.
host install-agent; RC=$?
check "install-agent again exits 0 (got $RC)" '[ $RC -eq 0 ]'
check "install-agent again only looks (got: $(calls | tr '\n' ';'))" 'looked && [ -z "$(acts)" ]'
check "install-agent again leaves the plist as it was" 'cmp -s "$PLIST" "$T/first.plist"'

# 4. Changed (another PATH): bootout the old one, then bootstrap the new.
EXTRA_PATH="$T/more:" host install-agent; RC=$?
check "install-agent with a change exits 0 (got $RC)" '[ $RC -eq 0 ]'
check "a change is bootout gui/$U/$LABEL, enable, bootstrap (got: $(calls | tr '\n' ';'))" \
  'looked && [ "$(acts)" = "$(printf "bootout gui/%s/%s\nenable gui/%s/%s\nbootstrap gui/%s %s" "$U" "$LABEL" "$U" "$LABEL" "$U" "$PLIST")" ]'
check "the changed plist lints" 'plutil -lint -s "$PLIST"'

# 5. The agent's own host program is not "another host": loaded with a pid, install and status go on.
dummy; AGENT=$D; echo "$AGENT" > "$FAKE/pid"
host install-agent; RC=$?
check "install-agent with the agent's own host running exits 0 (got $RC: $(tail -1 "$T/out"))" '[ $RC -eq 0 ]'
host agent-status; RC=$?
check "agent-status exits 0 and shows the plist, loaded, pid, logs" \
  '[ $RC -eq 0 ] && grep -q "plist:   $PLIST" "$T/out" && grep -q "loaded:  gui/$U/$LABEL" "$T/out" && grep -q "pid = $AGENT" "$T/out" && grep -q "chat-host.err.log" "$T/out" && ! grep -q "also:" "$T/out"'
# npm run host refuses while the agent runs.
host run; RC=$?
check "run refuses while the LaunchAgent runs (got $RC)" '[ $RC -eq 1 ] && grep -q "already runs as the LaunchAgent" "$T/out"'
kill "$AGENT" 2>/dev/null

# 6. Uninstall: bootout, plist gone; again: nothing to do, still 0.
i=0; while alive "$AGENT" && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
host uninstall-agent; RC=$?
check "uninstall-agent exits 0 (got $RC)" '[ $RC -eq 0 ]'
check "uninstall-agent is bootout gui/$U/$LABEL (got: $(calls | tr '\n' ';'))" \
  'looked && [ "$(acts)" = "bootout gui/$U/$LABEL" ]'
check "uninstall-agent removes the plist" '[ ! -e "$PLIST" ]'
host uninstall-agent; RC=$?
check "uninstall-agent again exits 0 and only looks (got $RC: $(calls | tr '\n' ';'))" '[ $RC -eq 0 ] && looked && [ -z "$(acts)" ]'
host agent-status
check "agent-status after uninstall says none, not loaded" 'grep -q "plist:   none" "$T/out" && grep -q "loaded:  no" "$T/out"'

# 7. A host in a terminal: install-agent refuses and names it; run refuses a second one too.
dummy; TERMHOST=$D
host install-agent; RC=$?
check "install-agent refuses while a terminal host runs (got $RC)" '[ $RC -eq 1 ] && grep -q "pid $TERMHOST" "$T/out" && grep -q -- "--replace" "$T/out"'
check "the refusal writes no plist and loads nothing (got: $(calls | tr '\n' ';'))" '[ ! -e "$PLIST" ] && ! grep -q bootstrap "$FAKE/calls"'
check "the refusal leaves the terminal host running" 'alive "$TERMHOST"'
host run; RC=$?
check "run refuses a second host on the same enrollment (got $RC)" '[ $RC -eq 1 ] && grep -q "already running on this enrollment (pid $TERMHOST" "$T/out"'
host agent-status
check "agent-status names the host outside the agent" 'grep -q "also:    a host outside the LaunchAgent (pid $TERMHOST" "$T/out"'

# 8. --replace: the terminal host is stopped, then the agent installed.
host install-agent --replace; RC=$?
check "install-agent --replace exits 0 (got $RC: $(tail -1 "$T/out"))" '[ $RC -eq 0 ]'
check "install-agent --replace stopped the terminal host" '! alive "$TERMHOST"'
check "install-agent --replace bootstraps the agent (got: $(calls | tr '\n' ';'))" 'grep -q "^bootstrap gui/$U $PLIST$" "$FAKE/calls" && plutil -lint -s "$PLIST"'
host install-agent --bogus; RC=$?
check "install-agent rejects an unknown flag with 2 (got $RC)" '[ $RC -eq 2 ]'
host uninstall-agent

# 9. The real Mac was never touched.
REAL_AFTER=$( [ -e "$REAL_PLIST" ] && echo there || echo absent )
check "the real ~/Library/LaunchAgents is as it was ($REAL_BEFORE)" '[ "$REAL_AFTER" = "$REAL_BEFORE" ]'

[ $PASSES -gt 0 ] || { echo "✗ test-host-agent: checked nothing" >&2; exit 1; }
if [ $FAILS -gt 0 ]; then echo "test-host-agent: $FAILS failed, $PASSES passed" >&2; exit 1; fi
echo "test-host-agent: ok · $PASSES checks · install, idempotent reinstall, change, status, uninstall twice, the agent's own host, a terminal host refused and --replace"
