#!/bin/sh
# Bring a lane branch up to main and push it, from its worktree:  npm run land
#   1. rebase onto origin/main; a conflict in a GENERATED file is settled by regenerating it
#      (npm run docs), never by hand; any other conflict stops here for a person.
#      A Gate A record (parity/gate-a/<state>.json) is settled the same way: keep main's, then
#      measure the rebased tree. Two lanes often lift the same state (a frame fix lifts the menus).
#   2. Gate A re-measures the rebased tree and records it (a count below the record stops here);
#      npm run check must pass.
#   3. push the branch; open or update its pull request.
set -eu
# README.md is NOT here: its timeline is generated but its prose is not, and a lane never
# rewrites the timeline (only main does), so a README conflict is a real one.
GEN='^(docs/PARITY\.md|docs/images/(roadmap|journeys|hero)\.svg)$'
REC='^parity/gate-a/[^/]+\.json$'
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] && { echo "land: on main; lanes land from their own branch (worktree)" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "land: commit first, the tree is not clean" >&2; exit 2; }
BASE=${BASE:-origin/main}   # BASE=main: rebase onto the local main (testing this script)
[ "$BASE" = origin/main ] && git fetch -q origin main
in_rebase() { [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; }
git rebase -q "$BASE" >/dev/null 2>&1 || true
n=0
while in_rebase; do
  n=$((n + 1)); [ $n -gt 50 ] && { echo "land: the rebase is still going after 50 steps; stopping (git rebase --abort to undo)" >&2; exit 1; }
  conflicted=$(git diff --name-only --diff-filter=U)
  if [ -n "$conflicted" ]; then
    other=$(printf '%s\n' "$conflicted" | grep -Ev "$GEN" | grep -Ev "$REC" || true)
    if [ -n "$other" ]; then echo "land: conflicts a person must settle:" >&2; printf '  %s\n' $other >&2; echo "(fix, git add, git rebase --continue, then npm run land again)" >&2; exit 1; fi
    # In a rebase, --ours is main. Records: main's numbers are the bar the re-measure must meet.
    printf '%s\n' "$conflicted" | grep -E "$REC" | xargs git checkout --ours -- 2>/dev/null || true
    printf '%s\n' "$conflicted" | grep -E "$GEN" | xargs git checkout --theirs -- 2>/dev/null || true
    npm run -s docs
    git checkout -q -- README.md 2>/dev/null || true
    # docs rewrites every generated file, conflicted or not: stage them all, or --continue refuses.
    printf '%s\n' "$conflicted" | xargs git add --
    git add docs/PARITY.md docs/images
  fi
  if GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then continue; fi
  [ -n "$(git diff --name-only --diff-filter=U)" ] && continue          # the next commit conflicts: settle it
  if git diff --cached --quiet; then git rebase --skip >/dev/null 2>&1 || true; continue; fi   # settled to nothing: drop it
  echo "land: the rebase stopped and the reason is not a conflict; see git status (git rebase --abort to undo)" >&2; exit 1
done
[ "$(git merge-base HEAD "$BASE")" = "$(git rev-parse "$BASE")" ] || { echo "land: the branch is not on $BASE after the rebase; stopping" >&2; exit 1; }
node scripts/gate.mjs --show 0   # records the rebased tree; exits 1 if any state fell below its record
npm run -s docs
git checkout -q -- README.md   # the timeline is main's to refresh
if [ -n "$(git status --porcelain)" ]; then git add -A docs parity/gate-a && git commit -q -m "Re-record Gate A and regenerate docs after rebase"; fi
npm run -s check
[ "${DRY:-}" = 1 ] && { echo "land: dry run, rebased and checked; not pushed"; exit 0; }
git push -q --force-with-lease -u origin "$branch"
gh pr view "$branch" >/dev/null 2>&1 || gh pr create --fill --base main --head "$branch" >/dev/null
echo "land: $branch is on origin/main + pushed; PR: $(gh pr view "$branch" --json url -q .url)"
