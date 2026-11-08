#!/bin/sh
# Bring a lane branch up to main and push it, from its worktree:  npm run land
#   1. rebase onto origin/main; a conflict in a GENERATED file is settled by regenerating it
#      (npm run docs), never by hand; any other conflict stops here for a person.
#   2. npm run check and the gate in compare mode must pass on the rebased tree.
#   3. push the branch; open or update its pull request.
set -eu
# README.md is NOT here: its timeline is generated but its prose is not, and a lane never
# rewrites the timeline (only main does), so a README conflict is a real one.
GEN='^(docs/PARITY\.md|docs/images/(roadmap|journeys|hero)\.svg)$'
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] && { echo "land: on main; lanes land from their own branch (worktree)" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "land: commit first, the tree is not clean" >&2; exit 2; }
BASE=${BASE:-origin/main}   # BASE=main: rebase onto the local main (testing this script)
[ "$BASE" = origin/main ] && git fetch -q origin main
if ! git rebase -q "$BASE"; then
  while :; do
    conflicted=$(git diff --name-only --diff-filter=U)
    [ -z "$conflicted" ] && break
    other=$(printf '%s\n' "$conflicted" | grep -Ev "$GEN" || true)
    if [ -n "$other" ]; then echo "land: conflicts a person must settle:" >&2; printf '  %s\n' $other >&2; echo "(fix, git add, git rebase --continue, then npm run land again)" >&2; exit 1; fi
    printf '%s\n' "$conflicted" | xargs git checkout --theirs --
    npm run -s docs
    git checkout -q -- README.md 2>/dev/null || true
    printf '%s\n' "$conflicted" | xargs git add --
    GIT_EDITOR=true git rebase --continue || true
  done
fi
npm run -s docs
git checkout -q -- README.md   # the timeline is main's to refresh
if [ -n "$(git status --porcelain)" ]; then git add -A docs && git commit -q -m "Regenerate docs after rebase"; fi
npm run -s check
node scripts/gate.mjs --ci --show 0
[ "${DRY:-}" = 1 ] && { echo "land: dry run, rebased and checked; not pushed"; exit 0; }
git push -q --force-with-lease -u origin "$branch"
gh pr view "$branch" >/dev/null 2>&1 || gh pr create --fill --base main --head "$branch" >/dev/null
echo "land: $branch is on origin/main + pushed; PR: $(gh pr view "$branch" --json url -q .url)"
