#!/usr/bin/env bash
# SwissCirkus Screenplays — deploy the co-writing server to Google Cloud Run.
# Plan: docs/COWRITING_SERVER_PLAN.md. Differs from upstream's deploy-cloudrun.sh:
#   · accounts live in PostgreSQL (Neon), not SQLite — Cloud Run's disk is wiped on every restart
#   · only our site may call it (CORS), invite links point at our page, Sign in with Google uses our client
#   · secrets (JWT, database password) are kept in Google Secret Manager, never in this file or the service's settings
#
# Run from Git Bash in this folder:
#   ./deploy-screenplays.sh <gcp-project-id> "<neon connection string>" [admin-email]
# The connection string is what Neon shows under Connect, e.g.
#   postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
# Running it again redeploys and keeps the existing secrets (the database password is updated if it changed).
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: don't rewrite "/…" arguments into Windows paths

PROJECT_ID="${1:?usage: ./deploy-screenplays.sh <gcp-project-id> <neon-connection-string> [admin-email]}"
DB_URL="${2:?the Neon connection string is required}"
ADMIN_EMAIL="${3:-}"

SERVICE="screenplays-cowrite"
REGION="us-central1"          # Cloud Run free tier region
REPO="screenplays"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE"
SITE_ORIGIN="https://swisscirkus.github.io"
APP_URL="https://swisscirkus.github.io/screenplays"
GOOGLE_CLIENT_ID="137075271992-st7deo4q3m0pptfo02ep31638bj07tor.apps.googleusercontent.com"

# ── Database pieces from the connection string ──
re='^postgres(ql)?://([^:]+):([^@]+)@([^/:]+)(:([0-9]+))?/([^?]+)'
[[ "$DB_URL" =~ $re ]] || { echo "ERROR: that doesn't look like a postgresql://user:password@host/db connection string"; exit 1; }
DB_USER="${BASH_REMATCH[2]}"; DB_PASSWORD="${BASH_REMATCH[3]}"; DB_HOST="${BASH_REMATCH[4]}"
DB_PORT="${BASH_REMATCH[6]:-5432}"; DB_NAME="${BASH_REMATCH[7]}"

gcloud config set project "$PROJECT_ID" --quiet
echo "Enabling Cloud Run, Cloud Build, Artifact Registry and Secret Manager…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --quiet

gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Screenplays co-writing server" --quiet

# ── Secrets ──
secret_put() { # name value — creates the secret, or adds a new version when the value changed
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --quiet
  elif [ "$(gcloud secrets versions access latest --secret="$name" 2>/dev/null)" != "$value" ]; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet
  fi
}
if ! gcloud secrets describe screenplays-jwt-secret >/dev/null 2>&1; then
  secret_put screenplays-jwt-secret "$(openssl rand -hex 32)"   # made once: changing it signs everyone out
fi
secret_put screenplays-db-password "$DB_PASSWORD"

# Cloud Run's service account reads the two secrets
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNNER="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
for s in screenplays-jwt-secret screenplays-db-password; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNNER" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done

echo "Building the server image with Cloud Build…"
gcloud builds submit --tag "$IMAGE" --quiet

echo "Deploying…"
ENV_VARS="NODE_ENV=production,DB_TYPE=postgresql,DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_SSL=true"
ENV_VARS="$ENV_VARS,CORS_ORIGINS=$SITE_ORIGIN,APP_URL=$APP_URL,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,DATA_DIR=/app/data"
ENV_VARS="$ENV_VARS,DOC_IDLE_TIMEOUT_MINUTES=30,WS_MAX_CONNECTIONS_PER_IP=50,WS_MAX_CONNECTIONS_PER_USER=10"
[ -n "$ADMIN_EMAIL" ] && ENV_VARS="$ENV_VARS,ADMIN_EMAILS=$ADMIN_EMAIL"

# One instance: everyone co-writing a script must reach the same live document.
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" --region="$REGION" --platform=managed --allow-unauthenticated \
  --port=8080 --memory=512Mi --cpu=1 --min-instances=0 --max-instances=1 \
  --timeout=3600 --session-affinity \
  --set-env-vars="$ENV_VARS" \
  --set-secrets="JWT_SECRET=screenplays-jwt-secret:latest,DB_PASSWORD=screenplays-db-password:latest" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo
echo "Co-writing server: $URL"
echo "Health:            $(curl -s "$URL/health" || echo 'no answer yet')"
echo "Build the web app with VITE_COLLAB_SERVER=$URL"
