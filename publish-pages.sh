#!/usr/bin/env bash
# SwissCirkus Screenplays — build the web app and publish it to GitHub Pages (https://swisscirkus.github.io/screenplays/).
# Run from Git Bash in this folder: bash publish-pages.sh
set -euo pipefail
cd "$(dirname "$0")"
COLLAB_SERVER="https://screenplays-cowrite-137075271992.us-central1.run.app"  # co-writing server (collab-server/deploy-screenplays.sh)

# The build is made from the files on disk: publish only committed work, never another session's half-finished edits.
if [ -n "$(git status --porcelain -- frontend/src frontend/public frontend/index.html)" ]; then
  echo "Not publishing: frontend has uncommitted changes (commit them, or wait for whoever is editing):"
  git status --short -- frontend/src frontend/public frontend/index.html
  exit 1
fi

# Our own build stamp, shown in Help › About under OpenDraft's version: a number that goes up with every commit, the
# commit, and the date (Christian 2026-11-15).
SC_BUILD="$(git rev-list --count HEAD)"
SC_COMMIT="$(git rev-parse --short HEAD)"
SC_DATE="$(git log -1 --format=%cd --date=format:'%d %b %Y' | sed 's/^0//')"
(cd frontend && MSYS_NO_PATHCONV=1 VITE_BASE=/screenplays/ VITE_COLLAB_SERVER="$COLLAB_SERVER"   VITE_SC_BUILD="$SC_BUILD" VITE_SC_COMMIT="$SC_COMMIT" VITE_SC_DATE="$SC_DATE" npx vite build)

OUT="$(mktemp -d)"
cp -r frontend/dist/. "$OUT/"
cp "$OUT/index.html" "$OUT/404.html"   # GitHub Pages serves the app for every /screenplays/... address
touch "$OUT/.nojekyll"
REV="$(git rev-parse --short HEAD)"
(
  cd "$OUT"
  git init -q -b gh-pages
  git -c core.autocrlf=false add -A
  git -c user.name=SwissCirkus -c user.email=SwissCirkus@users.noreply.github.com commit -q -m "Publish web build $REV"
  git push -q -f https://github.com/SwissCirkus/screenplays.git gh-pages
)
rm -rf "$OUT"
echo "Published $REV — live in a minute or two at https://swisscirkus.github.io/screenplays/"
