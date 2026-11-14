# Screenplays (SwissCirkus fork of OpenDraft) — Google Drive storage plan

Goal: the OpenDraft **web build** runs on GitHub Pages at `https://swisscirkus.github.io/screenplays/` with no Python
server, saving every project and script into the user's Google Drive, and opens in Kontroll as a permanent
**Screenplay** tab. Upstream: `Proteus-Technologies-Private-Limited/OpenDraft` (MIT), remote `upstream`.

## How storage works upstream

- Every call site uses one object, `api` (`frontend/src/services/api.ts`), about 45 methods: projects, scripts,
  versions (check-in / diff / restore), assets, locations, formatting templates, collaboration invites.
- On the web, `api` talks HTTP to the Python backend. On Tauri, `initStorage()` swaps every method with
  `Object.assign(api, createLocalStorage())` — a SQLite implementation (`local-storage.ts`, ~1,150 lines).
- So the fork adds **one more implementation**, `drive-storage.ts`, and swaps it in on the web branch of
  `initStorage()` (the `if (!isTauri())` block). Nothing else in the editor has to change for saving.
- `AuthGate` only opens sign-in dialogs when the HTTP API answers 401/402/403; with Drive storage it stays quiet.

## Drive layout (scope `drive.file`, the same Google client as Schedule and Invoices)

```
My Drive/Screenplays/                      (created on first run; appProperties.kontroll = "screenplays-root")
  <Project name>/                          one folder per project
    project.json                           ProjectInfo + properties + locations + script order
    <Script title>.odscript.json           script content (TipTap JSON) + meta
    <Script title>.fountain                plain mirror, rewritten on save (readable anywhere, Kontroll can import it)
    versions/<timestamp>-<hash>.json       one snapshot per check-in (only changed scripts, like local-storage.ts)
    assets/<file>                          images and documents attached to the project
  templates.json                           formatting templates
```

- Files are found by `appProperties` (ids), never by name, so renaming in Drive doesn't break anything.
- A local IndexedDB copy makes opening instant and covers short offline spells; every save goes to Drive
  ~1 s after typing stops, with a visible "Saved to Drive" status.
- Assets: `getAssetUrl` returns a blob URL fetched with the Drive token (the editor already fetches asset URLs
  through `authedFetch`; that path needs a Drive-aware branch).

## Steps

1. **Build and run the web version locally** with the HTTP backend off, to see what breaks without a server.
2. **`drive-storage.ts`**: Google sign-in (GSI token client, `drive.file`), folder/file helpers, then the `api`
   methods in this order — projects, scripts, versions, locations, templates, assets. Port logic from
   `local-storage.ts`, replacing SQL with Drive files.
3. **Swap it in** on the web branch of `initStorage()`; hide server-only UI on the web build (cloud server
   setting, account sign-in, quota).
4. **Publish** to GitHub Pages under `/screenplays/` (Vite `base: '/screenplays/'`, a Pages workflow).
5. **Kontroll**: a permanent Screenplay web tab (like the Schedule tab), File › Write Screenplay… opens it, its
   PDF export goes through the download catcher, and a **Send to Story Builder** action passes the Fountain text.
6. **Sharing with Vincent**: share the project folder through Drive (needs the Google Picker + API key so the
   app can open files it didn't create). Live co-writing needs OpenDraft's collab server hosted somewhere —
   decide later; per-person versions in Drive work without it.

## Keeping upstream updates

Keep changes small and in new files where possible (`drive-storage.ts`, a Pages workflow, a few lines in
`api.ts` / `config.ts`). Pull upstream with `git fetch upstream && git merge upstream/main`.
