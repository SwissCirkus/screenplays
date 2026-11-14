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

(cd frontend && MSYS_NO_PATHCONV=1 VITE_BASE=/screenplays/ VITE_COLLAB_SERVER="$COLLAB_SERVER" npx vite build)

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
