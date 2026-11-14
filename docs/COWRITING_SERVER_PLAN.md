# Screenplays — co-writing server plan (2026-11-14)

Goal: live co-writing in the Screenplay app (swisscirkus.github.io/screenplays and Kontroll's Screenplay tab) for everyone who
uses it, with **no setup for them**. We run **one** co-writing server; every user signs in to it. (Anyone who wants their own can
still run one later; nobody has to.)

Why not OpenDraft's servers: they only accept requests from their own app's addresses (CORS allow-list: localhost, Tauri). From
`https://swisscirkus.github.io` their co-writing server answers 500 and their main server 400.

## What the server is

`collab-server/` in this repo — one Node program (Hocuspocus + Express). It already does everything co-writing needs, with no
Python backend (OpenDraft's desktop app uses it exactly this way):

- **Accounts** at `/auth/*`: email + password (needs an email sender for verification), or **Sign in with Google** (`/auth/google`,
  verifies a Google ID token — no email sender needed).
- **Invites** at `/api/collab/*`: the host (signed in) makes an invite link with a role (editor / suggester / read-only); a guest
  joins with **just the link**, no account.
- **Live typing** over a WebSocket (Yjs): the host's copy is the master; the server relays and holds the live document while a
  session runs (idle documents are dropped after 30 min).
- Stores: accounts, devices and invites in a database (SQLite file or PostgreSQL); live documents as files in `DATA_DIR`.
- Settings are environment variables (`src/config.ts`): `JWT_SECRET`, `CORS_ORIGINS`, `APP_URL`, `GOOGLE_CLIENT_ID`,
  `DB_TYPE`/`DB_*`, `SMTP_*`, `ADMIN_EMAILS`, limits.

Scripts themselves never live on the server: each writer's library stays in their browser + Google Drive.

## Hosting

| | **Google Cloud Run** (recommended) | Small VM (Google e2-micro / Hetzner) |
|---|---|---|
| HTTPS + WebSockets | built in, `https://…run.app` address | needs a hostname + Caddy/Cloudflare Tunnel |
| Upkeep | none (Google runs it) | OS updates, restarts |
| Accounts database | **must be external** — the container's disk is wiped on restart | SQLite file on the VM's disk is fine |
| Cost at our use | ~free: 180,000 vCPU-seconds/month free ≈ 50 hours of live sessions, then ≈ $0.09 per session-hour | e2-micro free tier / ~€4/month |
| Ready-made | `collab-server/deploy-cloudrun.sh` (but it uses SQLite → accounts would vanish; must change to PostgreSQL) | Dockerfile |

Cloud Run settings from upstream's script: 1 instance max (all co-writers of a script must reach the same instance), session
affinity, 60-min request timeout (a session reconnects after an hour — Hocuspocus does that automatically), scale to zero
(the first sign-in after a quiet spell waits a few seconds).

Accounts database for Cloud Run: **Neon** free PostgreSQL (0.5 GB, plenty) or **Google Cloud SQL** (~$10/month, same Google
account). `DB_TYPE=postgresql` is already supported.

## Changes in the app (this fork, web build)

1. `config.ts`: a `VITE_COLLAB_SERVER` build setting (our Cloud Run address) → the co-writing WebSocket (`wss://…`) and the
   account address. Today the web build sends sign-in to `<page>/api/auth/*` (Python backend proxy); with the browser library
   it goes straight to `<server>/auth/*` (`collabAuth.ts`: one base-URL helper).
2. `web-storage.ts`: replace the five co-writing stubs with the same collab-server calls `local-storage.ts` uses on desktop
   (`/api/collab/invite`, `/session/:token`, …, via `authedFetch`).
3. Menu bar: show the account chip (Sign in for co-writing) beside the Drive button; Drive stays the storage either way.
4. **Sign in with Google**: fill the empty `client_id` in `CollabLoginDialog.tsx` with our Google client (same one as Drive), so
   signing in is one click with the Google account people already connected Drive with. Hide email + password at first
   (no email sender needed); add it later with an SMTP account if wanted.
5. Guest joins: the page's optional project-title fetch (`ScreenplayEditor.tsx`, `getApiBase()/projects/…`) is skipped on the
   browser library — the content comes over the live connection anyway.
6. Tests: the co-writing calls against a fake collab server; a real end-to-end check with two browser tabs (host + guest).

## Server setup steps (one time)

1. **Christian**: Google Cloud project with **billing enabled** (Cloud Run needs it even inside the free tier); install the
   gcloud CLI (`winget install Google.CloudSDK`) and run `gcloud auth login` (his sign-in).
2. **Christian**: make the accounts database (Neon sign-up → copy the connection details), or choose Cloud SQL.
3. **Claude**: change `deploy-cloudrun.sh` → PostgreSQL, `CORS_ORIGINS=https://swisscirkus.github.io`, `APP_URL=https://swisscirkus.github.io/screenplays`,
   `GOOGLE_CLIENT_ID` = our client, `ADMIN_EMAILS` = Christian; secrets (JWT, DB password) in Google Secret Manager, not in
   the script. Deploy, check `/health`, sign in, invite, join from a second browser.
4. **Claude**: point the web build at the server address, rebuild, publish to GitHub Pages; Kontroll's Screenplay tab needs
   no change. Update Kontroll's help guide (Screenplay section: co-writing).
5. Later, optional: "use Kontroll's own sign-in" instead of separate accounts; a custom address (e.g. `cowrite.<domain>`);
   Kontroll's "your own Cloudflare" style self-hosting for other studios.

## Decisions needed

1. Hosting: **Cloud Run** (recommended) or a VM.
2. Accounts database: **Neon free** (recommended) or Cloud SQL (~$10/month).
3. Sign-in: **Google only** to start (recommended), or email + password too (needs an email account for sending).
4. Address: the free `…run.app` address (recommended to start) or a domain you own.
