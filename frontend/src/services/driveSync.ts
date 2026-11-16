/**
 * Google Drive mirror for the browser library — SwissCirkus fork.
 *
 * The library (web-storage.ts) is the working copy and saves instantly in the
 * browser. Every change is queued here (persisted, so nothing is lost while
 * Drive is disconnected) and written to the writer's Drive ~1.5 s later.
 * Connecting pulls anything newer from Drive first (another computer, or
 * Kontroll's tab), then pushes what's queued.
 *
 * Drive layout (scope drive.file — the app only sees files it made):
 *   Screenplays/
 *     <Project>/
 *       project.json                 project, locations, script list, asset list
 *       <Script>.screenplay.json     { meta, content } — what the editor opens
 *       <Script>.fountain            plain-text copy, readable anywhere
 *       versions/<date> <msg>.json   one snapshot per check-in
 *       assets/<file>                images and documents
 *     templates.json
 * Files are found by appProperties (sp = kind, spId = id), never by name.
 */

import { create } from 'zustand';
import type { KvStore } from './kvStore';
import {
  keys,
  type ChangeUnit,
  type ProjectRecord,
  type VersionRecord,
  type AssetRecord,
  type AssetMeta,
} from './web-storage';
import type { ScriptMeta } from './api';
import { collabServerHttp } from '../config';
import { useSettingsStore } from '../stores/settingsStore';
import { ensureCollabAuthenticated, handleAuthResponse, type AuthResponse } from './collabAuth';

export const GOOGLE_CLIENT_ID = '137075271992-st7deo4q3m0pptfo02ep31638bj07tor.apps.googleusercontent.com'; // same client as Schedule
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'Screenplays';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CONNECTED_FLAG = 'screenplays:driveConnected';
const DIRTY_KEY = 'drive/dirty';
/** Scripts whose name came in from Drive but whose text is still there: { scriptId: { fileId, pid } }. */
const LAZY_KEY = 'drive/lazy';
const MAP_KEY = 'drive/map';

// ── Transport (fetch in the app, a fake in tests) ───────────────────────────

export interface DriveFile { id: string; name: string; appProperties?: Record<string, string>; parents?: string[] }
export interface DriveMeta { name?: string; mimeType?: string; parents?: string[]; /** null removes a key */ appProperties?: Record<string, string | null> }
export interface DriveTransport {
  /** Files (not trashed) whose appProperties include every pair in `props`; optionally under `parent`. */
  find(props: Record<string, string>, parent?: string): Promise<DriveFile[]>;
  create(meta: DriveMeta, body?: Blob | string, mime?: string): Promise<DriveFile>;
  update(id: string, meta: DriveMeta, body?: Blob | string, mime?: string): Promise<DriveFile>;
  download(id: string): Promise<Blob>;
  trash(id: string): Promise<void>;
}

export class DriveAuthError extends Error {}
export class DriveNotFoundError extends Error {}

export function createFetchTransport(getToken: () => string | null): DriveTransport {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const req = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = getToken();
    if (!token) throw new DriveAuthError('Connect Google Drive again');
    const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new DriveAuthError('Connect Google Drive again');
    if (res.status === 404) throw new DriveNotFoundError(`Drive file not found: ${url}`);
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  };
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const multipart = (meta: DriveMeta, body: Blob | string, mime: string) => {
    const b = `sp${Math.random().toString(16).slice(2)}`;
    return {
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: new Blob([
        `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${b}\r\nContent-Type: ${mime}\r\n\r\n`, body, `\r\n--${b}--`,
      ]),
    };
  };
  const FIELDS = 'id,name,appProperties,parents';
  return {
    async find(props, parent) {
      const q = [
        'trashed=false',
        ...Object.entries(props).map(([k, v]) => `appProperties has { key='${esc(k)}' and value='${esc(v)}' }`),
        ...(parent ? [`'${esc(parent)}' in parents`] : []),
      ].join(' and ');
      const out: DriveFile[] = [];
      let pageToken = '';
      do {
        const url = `${API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const json = await (await req(url)).json();
        out.push(...(json.files || []));
        pageToken = json.nextPageToken || '';
      } while (pageToken);
      return out;
    },
    async create(meta, body, mime = 'application/json') {
      if (body === undefined) {
        return (await req(`${API}?fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json();
      }
      const mp = multipart(meta, body, mime);
      return (await req(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', ...mp })).json();
    },
    async update(id, meta, body, mime = 'application/json') {
      if (body === undefined) {
        return (await req(`${API}/${id}?fields=${FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json();
      }
      const mp = multipart(meta, body, mime);
      return (await req(`${UPLOAD}/${id}?uploadType=multipart&fields=${FIELDS}`, { method: 'PATCH', ...mp })).json();
    },
    async download(id) {
      return (await req(`${API}/${id}?alt=media`)).blob();
    },
    async trash(id) {
      await req(`${API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    },
  };
}

// ── Status shown in the menu bar ────────────────────────────────────────────

export type DriveState = 'ready' | 'connecting' | 'saving' | 'synced' | 'expired' | 'error';
interface DriveStatus {
  state: DriveState;
  message: string;
  pending: number;
  lastSaved: string | null;
  set: (s: Partial<Omit<DriveStatus, 'set'>>) => void;
}
export const useDriveStatus = create<DriveStatus>((set) => ({
  state: 'ready', message: '', pending: 0, lastSaved: null,
  set: (s) => set(s),
}));

// ── File naming ─────────────────────────────────────────────────────────────

export function safeName(name: string, fallback: string): string {
  return (String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || fallback).slice(0, 150);
}

function unitKey(u: ChangeUnit): string {
  switch (u.kind) {
    case 'project': return `project|${u.projectId}`;
    case 'script': return `script|${u.projectId}|${u.scriptId}`;
    case 'version': return `version|${u.projectId}|${u.versionId}`;
    case 'asset': return `asset|${u.projectId}|${u.assetId}`;
    case 'templates': return 'templates';
  }
}

interface ProjectFile extends ProjectRecord { scripts: ScriptMeta[]; assets: AssetMeta[] }

// ── The sync engine ─────────────────────────────────────────────────────────

export interface DriveSyncOptions {
  /** Delay between the last change and the write to Drive. */
  debounceMs?: number;
  /** Plain-text copy of a script; skipped when it returns null. */
  toFountain?: (content: unknown) => Promise<string | null>;
  /** Called after a pull brought anything new in, so lists can refresh. */
  onPulled?: () => void;
}

export function createDriveSync(kv: KvStore, transport: DriveTransport, opts: DriveSyncOptions = {}) {
  const debounceMs = opts.debounceMs ?? 1500;
  const status = useDriveStatus.getState();
  let connected = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  let idMap: Record<string, string> | null = null;

  // ── Persisted queue and id map ──
  async function dirtyList(): Promise<string[]> { return (await kv.get<string[]>(DIRTY_KEY)) ?? []; }
  async function setDirty(list: string[]) { await kv.put(DIRTY_KEY, list); useDriveStatus.getState().set({ pending: list.length }); }
  async function map(): Promise<Record<string, string>> {
    if (!idMap) idMap = (await kv.get<Record<string, string>>(MAP_KEY)) ?? {};
    return idMap;
  }
  async function remember(key: string, id: string | null) {
    const m = await map();
    if (id) m[key] = id; else delete m[key];
    await kv.put(MAP_KEY, m);
  }

  /** Find a Drive file by its appProperties (cached id first). */
  async function locate(key: string, props: Record<string, string>, parent?: string): Promise<string | null> {
    const m = await map();
    if (m[key]) return m[key];
    const found = await transport.find(props, parent);
    if (found[0]) { await remember(key, found[0].id); return found[0].id; }
    return null;
  }

  /** Write a file: update it where it is, or create it if it's gone. */
  async function put(key: string, props: Record<string, string>, parent: string, name: string, body?: Blob | string, mime?: string, folder = false): Promise<string> {
    const existing = await locate(key, props, parent);
    if (existing) {
      try {
        await transport.update(existing, { name }, body, mime);
        return existing;
      } catch (e) {
        if (!(e instanceof DriveNotFoundError)) throw e;
        await remember(key, null);
      }
    }
    const made = await transport.create(
      { name, parents: [parent], appProperties: props, ...(folder ? { mimeType: FOLDER_MIME } : {}) },
      folder ? undefined : body, mime,
    );
    await remember(key, made.id);
    return made.id;
  }

  async function trashKey(key: string, props: Record<string, string>) {
    const id = await locate(key, props);
    if (!id) return;
    try { await transport.trash(id); } catch (e) { if (!(e instanceof DriveNotFoundError)) throw e; }
    await remember(key, null);
  }

  // ── Folders ──
  async function rootFolder(): Promise<string> {
    const id = await locate('root', { sp: 'root' });
    if (id) return id;
    const made = await transport.create({ name: ROOT_NAME, mimeType: FOLDER_MIME, appProperties: { sp: 'root' } });
    await remember('root', made.id);
    return made.id;
  }
  async function projectFolder(pid: string, name: string): Promise<string> {
    return put(`folder|${pid}`, { sp: 'project', spId: pid }, await rootFolder(), safeName(name, 'Project'), undefined, undefined, true);
  }
  async function subFolder(kind: 'versions' | 'assets' | 'original', pid: string, projectName: string): Promise<string> {
    const key = `${kind}|${pid}`;
    const existing = await locate(key, { sp: kind, spId: pid });
    if (existing) return existing;
    // The imported originals' folder reads "Original" (Christian 2026-11-14: "keep the original script … in a subfolder called original").
    const folderName = kind === 'original' ? 'Original' : kind;
    return put(key, { sp: kind, spId: pid }, await projectFolder(pid, projectName), folderName, undefined, undefined, true);
  }

  // ── Pushing one unit ──
  async function projectFile(pid: string): Promise<ProjectFile | null> {
    const rec = await kv.get<ProjectRecord>(keys.project(pid));
    if (!rec) return null;
    const scripts = (await Promise.all((await kv.keys(keys.scripts(pid))).map((k) => kv.get<ScriptMeta>(k)))).filter(Boolean) as ScriptMeta[];
    const assets = (await Promise.all((await kv.keys(keys.assets(pid))).map((k) => kv.get<AssetRecord>(k)))).filter(Boolean).map((a) => a!.meta);
    return { ...rec, scripts, assets };
  }

  async function pushProject(pid: string) {
    const file = await projectFile(pid);
    if (!file) return;
    const folder = await projectFolder(pid, file.info.name);
    await put(`projectjson|${pid}`, { sp: 'projectjson', spId: pid }, folder, 'project.json', JSON.stringify(file, null, 1));
  }

  async function pushScript(pid: string, sid: string) {
    const rec = await kv.get<ProjectRecord>(keys.project(pid));
    const meta = await kv.get<ScriptMeta>(keys.script(pid, sid));
    if (!rec || !meta) return;
    let stored = await kv.get(keys.content(sid));
    // Its text hasn't come in from Drive yet: fetch it first — never send an empty script over the real one.
    if (stored === undefined) stored = await loadScript(sid);
    if (stored === undefined) return;
    const content = stored ?? null;
    const folder = await projectFolder(pid, rec.info.name);
    const base = safeName(meta.title, 'Untitled');
    await put(`script|${sid}`, { sp: 'script', spId: sid, spProject: pid }, folder, `${base}.screenplay.json`, JSON.stringify({ meta, content }));
    if (opts.toFountain && content) {
      let text: string | null = null;
      try { text = await opts.toFountain(content); } catch (e) { console.warn('[drive] Fountain copy skipped', e); }
      if (text != null) await put(`fountain|${sid}`, { sp: 'fountain', spId: sid }, folder, `${base}.fountain`, text, 'text/plain');
    }
    // project.json (the script list) is queued alongside by markDirty.
  }

  async function pushVersion(pid: string, vid: string) {
    const rec = await kv.get<ProjectRecord>(keys.project(pid));
    const v = await kv.get<VersionRecord>(keys.version(pid, vid));
    if (!rec || !v) return;
    const folder = await subFolder('versions', pid, rec.info.name);
    const label = `${v.created_at.slice(0, 16).replace('T', ' ').replace(':', '.')} ${safeName(v.message, '').slice(0, 60)}`.trim();
    await put(`version|${vid}`, { sp: 'version', spId: vid, spProject: pid }, folder, `${label}.json`, JSON.stringify(v));
  }

  async function pushAsset(pid: string, aid: string) {
    const rec = await kv.get<ProjectRecord>(keys.project(pid));
    const a = await kv.get<AssetRecord>(keys.asset(pid, aid));
    if (!rec || !a) return;
    // A script's original file (tagged 'original' at import) goes to the project's Original folder; other files to assets.
    const folder = await subFolder((a.meta.tags || []).includes('original') ? 'original' : 'assets', pid, rec.info.name);
    await put(`asset|${aid}`, { sp: 'asset', spId: aid, spProject: pid }, folder, safeName(a.meta.original_name, a.meta.filename), a.blob, a.meta.mime_type);
  }

  async function pushTemplates() {
    const list = (await kv.get<any[]>(keys.templates)) ?? [];
    await put('templates', { sp: 'templates' }, await rootFolder(), 'templates.json', JSON.stringify(list));
  }

  /** Keep the file in Drive but stop it being ours: its markers go, so nothing here finds it or brings it back. */
  async function releaseKey(key: string, props: Record<string, string>) {
    const id = await locate(key, props);
    if (!id) return;
    const cleared: Record<string, null> = {};
    for (const k of Object.keys(props)) cleared[k] = null;
    try { await transport.update(id, { appProperties: cleared }); } catch (e) { if (!(e instanceof DriveNotFoundError)) throw e; }
    await remember(key, null);
  }

  async function pushUnit(key: string, deleted: boolean, release = false) {
    const [kind, a, b] = key.split('|');
    if (release && kind === 'project') {
      // Remove (keep in Google Drive): the project's folder and files stay where they are; project.json (how a project
      // is found) and the folder lose their markers, so no copy of the writer brings it back (Christian 2026-11-15).
      await releaseKey(`projectjson|${a}`, { sp: 'projectjson', spId: a });
      await releaseKey(`folder|${a}`, { sp: 'project', spId: a });
      return;
    }
    if (deleted) {
      if (kind === 'project') await trashKey(`folder|${a}`, { sp: 'project', spId: a });
      else if (kind === 'script') {
        await trashKey(`script|${b}`, { sp: 'script', spId: b });
        await trashKey(`fountain|${b}`, { sp: 'fountain', spId: b });
      } else if (kind === 'version') await trashKey(`version|${b}`, { sp: 'version', spId: b });
      else if (kind === 'asset') await trashKey(`asset|${b}`, { sp: 'asset', spId: b });
      return;
    }
    if (kind === 'project') await pushProject(a);
    else if (kind === 'script') await pushScript(a, b);
    else if (kind === 'version') await pushVersion(a, b);
    else if (kind === 'asset') await pushAsset(a, b);
    else if (kind === 'templates') await pushTemplates();
  }

  // ── Pulling from Drive ──
  async function readJson<T>(id: string): Promise<T | null> {
    try { return JSON.parse(await (await transport.download(id)).text()) as T; } catch (e) {
      if (e instanceof DriveAuthError) throw e;
      console.warn('[drive] could not read', id, e);
      return null;
    }
  }

  /** Bring in anything newer on Drive. Returns how many items changed here. */
  // ── Scripts whose name is here but whose text is still on Drive ──
  async function lazyList(): Promise<Record<string, { fileId: string; pid: string }>> {
    return (await kv.get<Record<string, { fileId: string; pid: string }>>(LAZY_KEY)) ?? {};
  }
  const loading = new Map<string, Promise<unknown>>();
  /** Fetch one script's text now (opening it, or the background fill). Undefined when there's nothing to fetch. */
  async function loadScript(sid: string): Promise<Record<string, unknown> | null | undefined> {
    const busy = loading.get(sid);
    if (busy) return busy as Promise<Record<string, unknown> | null | undefined>;
    const job = (async () => {
      const entry = (await lazyList())[sid];
      if (!entry) return undefined;
      const body = await readJson<{ meta: ScriptMeta; content: Record<string, unknown> | null }>(entry.fileId);
      if (!body) throw new Error('This script is still in Google Drive and could not be fetched — check the connection and try again.'); // i18n-ignore: SwissCirkus
      // Not if it was written to here meanwhile (then this browser's copy is the newer one).
      if ((await kv.get(keys.content(sid))) === undefined) await kv.put(keys.content(sid), body.content ?? null);
      const lazy = await lazyList();
      delete lazy[sid];
      await kv.put(LAZY_KEY, lazy);
      return (await kv.get<Record<string, unknown> | null>(keys.content(sid))) ?? null;
    })();
    loading.set(sid, job);
    try { return await job; } finally { loading.delete(sid); }
  }

  let filling: Promise<void> | null = null;
  /** Bring in the scripts' texts (six at a time), then versions, then assets — without holding up anything else. */
  function backgroundFill(versionFiles: DriveFile[] = [], assetJobs: Array<{ pid: string; meta: AssetMeta; file: DriveFile }> = []): Promise<void> {
    // Links (Google Docs and other web links, small .url files) come first and show at once: they used to wait behind
    // every script text and every big Original file, so a tab closed early never had them (Christian 2026-11-15: "all my
    // Google Docs that I've added in my Kontroll version are not there in my browser version").
    const isLink = (m: AssetMeta) => /\.url$/i.test(m.filename || m.original_name || '') || m.mime_type === 'application/internet-shortcut';
    const linkJobs = assetJobs.filter((j) => isLink(j.meta));
    const otherJobs = assetJobs.filter((j) => !isLink(j.meta));
    const fetchAsset = async ({ pid, meta, file }: { pid: string; meta: AssetMeta; file: DriveFile }) => {
      try {
        const blob = await transport.download(file.id);
        await kv.put(keys.asset(pid, meta.id), { meta, blob } satisfies AssetRecord);
        await remember(`asset|${meta.id}`, file.id);
      } catch (e) { if (e instanceof DriveAuthError) throw e; console.warn('[drive] asset skipped', meta.id, e); }
    };
    const shown = () => { try { opts.onPulled?.(); } catch { /* the list refreshes on the next one */ } };
    const run = async () => {
      try {
        if (linkJobs.length) { await inParallel(linkJobs, 6, fetchAsset); shown(); }
        await inParallel(Object.keys(await lazyList()), 6, async (sid) => {
          try { await loadScript(sid); } catch (e) { if (e instanceof DriveAuthError) throw e; console.warn('[drive] script text skipped', sid, e); }
        });
        await inParallel(versionFiles, 6, async (vf) => {
          const vid = vf.appProperties?.spId, pid = vf.appProperties?.spProject;
          if (!vid || !pid || (await kv.get(keys.version(pid, vid)))) return;
          const v = await readJson<VersionRecord>(vf.id);
          if (!v) return;
          await kv.put(keys.version(pid, vid), v);
          await remember(`version|${vid}`, vf.id);
        });
        await inParallel(otherJobs, 4, fetchAsset);
        if (otherJobs.length) shown();
      } catch (e) {
        handleError(e);
      }
    };
    filling = (filling ?? Promise.resolve()).then(run);
    return filling;
  }

  /** Run `work` over `items`, `limit` at a time (Drive answers several requests at once happily). */
  async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const item = items[next++]; await work(item); }
    });
    await Promise.all(runners);
  }

  /**
   * Bring in anything newer on Drive. Returns how many items changed here.
   *
   * Fast (Christian 2026-11-14: "it's very slow … shouldn't that be instant?"): four searches find every project, script,
   * version and asset file at once (no search per file); downloads run six at a time; projects and scripts come first
   * and show as they arrive (onPulled while it runs); the imported originals and other assets follow last.
   */
  async function pull(): Promise<number> {
    let changedCount = 0;
    const pending = new Set((await dirtyList()).map((k) => k.replace(/^[-~]/, '')));
    const byId = (files: DriveFile[]) => {
      const m = new Map<string, DriveFile>();
      for (const f of files) { const id = f.appProperties?.spId; if (id && !m.has(id)) m.set(id, f); }
      return m;
    };
    const [projectFiles, scriptFiles, versionFiles, assetFiles] = await Promise.all([
      transport.find({ sp: 'projectjson' }), transport.find({ sp: 'script' }),
      transport.find({ sp: 'version' }), transport.find({ sp: 'asset' }),
    ]);
    const scripts = byId(scriptFiles), assets = byId(assetFiles);

    // Show what has arrived every second or so, not only at the end.
    let lastShown = 0, shownCount = 0;
    const showProgress = (force = false) => {
      if (changedCount === shownCount || (!force && Date.now() - lastShown < 1000)) return;
      lastShown = Date.now(); shownCount = changedCount;
      try { opts.onPulled?.(); } catch { /* the list refreshes on the next one */ }
    };

    const assetJobs: Array<{ pid: string; meta: AssetMeta; file: DriveFile }> = [];
    await inParallel(projectFiles, 4, async (f) => {
      const remote = await readJson<ProjectFile>(f.id);
      if (!remote?.info?.id) return;
      const pid = remote.info.id;
      await remember(`projectjson|${pid}`, f.id);
      if (f.parents?.[0]) await remember(`folder|${pid}`, f.parents[0]);
      const local = await kv.get<ProjectRecord>(keys.project(pid));
      const remoteNewer = !local || remote.info.updated_at > local.info.updated_at;
      if (remoteNewer && !pending.has(`project|${pid}`)) {
        await kv.put(keys.project(pid), { info: remote.info, locations: remote.locations ?? [] } satisfies ProjectRecord);
        changedCount++;
      }

      // Scripts: newer copy wins, script by script — six downloads at a time.
      const remoteIds = new Set<string>((remote.scripts ?? []).map((m) => m.id));
      const wanted: ScriptMeta[] = [];
      for (const meta of remote.scripts ?? []) {
        if (pending.has(`script|${pid}|${meta.id}`)) continue;
        const mine = await kv.get<ScriptMeta>(keys.script(pid, meta.id));
        if (mine && mine.updated_at >= meta.updated_at) continue;
        wanted.push(meta);
      }
      // Names first (Christian 2026-11-14: "just reads … the folder names and the file names … so it looks like it's all
      // there right from the beginning"): the script's entry comes in now from project.json; its text is fetched in the
      // background, or right away when it's opened (loadScript). An older text here is dropped so it can't be opened
      // and saved back over the newer one.
      const lazy = await lazyList();
      for (const meta of wanted) {
        const sf = scripts.get(meta.id);
        if (!sf) continue;
        await remember(`script|${meta.id}`, sf.id);
        await kv.put(keys.script(pid, meta.id), meta);
        await kv.delete(keys.content(meta.id));
        lazy[meta.id] = { fileId: sf.id, pid };
        changedCount++;
      }
      await kv.put(LAZY_KEY, lazy);
      // A script deleted on the other side (only when that side is newer).
      if (remoteNewer && local) {
        for (const k of await kv.keys(keys.scripts(pid))) {
          const sid = k.slice(keys.scripts(pid).length);
          if (!remoteIds.has(sid) && !pending.has(`script|${pid}|${sid}`)) {
            await kv.delete(keys.content(sid));
            await kv.delete(k);
            changedCount++;
          }
        }
      }
      // Assets this browser doesn't have: fetched after every project's scripts are in.
      for (const am of remote.assets ?? []) {
        const af = assets.get(am.id);
        if (af && !(await kv.get(keys.asset(pid, am.id)))) assetJobs.push({ pid, meta: am, file: af });
      }
      showProgress();
    });
    showProgress(true);

    // The rest comes in the background: the scripts' texts, then versions, then the originals and other assets.
    void backgroundFill(versionFiles, assetJobs);

    const tf = await locate('templates', { sp: 'templates' });
    if (tf && !pending.has('templates')) {
      const localT = (await kv.get<any[]>(keys.templates)) ?? [];
      const remoteT = await readJson<any[]>(tf);
      if (remoteT && remoteT.length && !localT.length) { await kv.put(keys.templates, remoteT); changedCount++; }
    }
    return changedCount;
  }

  // ── Flushing the queue ──
  async function flushNow(): Promise<void> {
    if (!connected) return;
    const st = useDriveStatus.getState();
    let list = await dirtyList();
    if (!list.length) return;
    st.set({ state: 'saving', message: '' });
    try {
      while (list.length) {
        const key = list[0];
        await pushUnit(key.replace(/^[-~]/, ''), key.startsWith('-') || key.startsWith('~'), key.startsWith('~'));
        // Re-read: more may have been queued while this one was writing.
        list = (await dirtyList()).filter((k) => k !== key);
        await setDirty(list);
      }
      useDriveStatus.getState().set({ state: 'synced', message: '', lastSaved: new Date().toISOString() });
    } catch (e) {
      handleError(e);
    }
  }

  function handleError(e: unknown) {
    if (e instanceof DriveAuthError) {
      connected = false;
      useDriveStatus.getState().set({ state: 'expired', message: e.message });
    } else {
      console.error('[drive] sync failed', e);
      useDriveStatus.getState().set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; running = running.then(flushNow); }, debounceMs);
  }

  return {
    /** web-storage's onChange: queue the unit (persisted) and schedule a write. */
    markDirty(unit: ChangeUnit) {
      const key = unitKey(unit);
      const deleted = 'deleted' in unit && !!unit.deleted;
      // "~" = removed here but kept in Drive (Remove, keep in Google Drive); "-" = deleted (Drive's bin too).
      const keep = unit.kind === 'project' && deleted && !!unit.keepOnDrive;
      running = running.then(async () => {
        const list = (await dirtyList()).filter((k) => k !== key && k !== `-${key}` && k !== `~${key}`);
        // A deleted project also drops its queued children.
        const kept = deleted && unit.kind === 'project'
          ? list.filter((k) => !k.replace(/^[-~]/, '').includes(`|${unit.projectId}`))
          : list;
        kept.push(keep ? `~${key}` : deleted ? `-${key}` : key);
        // project.json lists the scripts and assets, so it follows them (once).
        if ((unit.kind === 'script' || unit.kind === 'asset')) {
          const pk = `project|${unit.projectId}`;
          const at = kept.indexOf(pk);
          if (at >= 0) kept.splice(at, 1);
          if (!kept.includes(`-${pk}`)) kept.push(pk);
        }
        await setDirty(kept);
      });
      schedule();
    },

    /** Called once a token is in hand: pull, then push the queue. */
    async connect(): Promise<number> {
      connected = true;
      status.set({ state: 'connecting', message: '' });
      let pulled = 0;
      const job = running.then(async () => {
        try {
          await rootFolder();
          pulled = await pull();
          if (pulled) opts.onPulled?.();
          await flushNow();
          const st = useDriveStatus.getState();
          if (st.state === 'connecting' || st.state === 'saving') st.set({ state: 'synced', lastSaved: new Date().toISOString() });
        } catch (e) { handleError(e); }
      });
      running = job;
      await job;
      return pulled;
    },

    disconnect() { connected = false; },

    /** Wait for queued writes (tests, and "Saving…" before closing). */
    async flush(): Promise<void> {
      if (timer) { clearTimeout(timer); timer = null; }
      running = running.then(flushNow);
      await running;
    },

    async pending(): Promise<string[]> { return dirtyList(); },

    /** Fetch a script's text now when only its name has come in (web-storage's loadMissingContent). */
    loadScript: (_projectId: string, scriptId: string) => loadScript(scriptId),

    /** Resolves when the background fill (texts, versions, assets) started by the last connect has finished. */
    async whenFilled(): Promise<void> { await (filling ?? Promise.resolve()); },
  };
}

export type DriveSync = ReturnType<typeof createDriveSync>;

// ── Google sign-in (browser only) ───────────────────────────────────────────

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
/* Staying connected (Christian 2026-11-14, from Kontroll: "I have to connect to Google Drive every time I open it — can you not stay
   connected?"): the access token is kept for its lifetime (about an hour) so a reload doesn't forget it; when it has run out, someone who
   connected before is reconnected quietly at start (consent was given — Google doesn't ask again); and it is renewed a minute before it
   runs out while the app is open. Still the browser-only token flow — no refresh token is ever stored. */
const TOKEN_KEY = 'screenplays:driveToken';
try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); if (t && t.token && Number(t.expiry) > Date.now()) { accessToken = t.token; tokenExpiry = Number(t.expiry); } } catch { /* none kept */ }
let renewTimer: any = null;
function keepToken() {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: accessToken, expiry: tokenExpiry })); } catch { /* ignore */ }
  clearTimeout(renewTimer);
  const wait = tokenExpiry - Date.now() - 60000;
  if (wait > 0) renewTimer = setTimeout(() => { void renewQuietly(); }, wait);
}
/** A fresh Drive pass without asking: from the co-writing server when it keeps one for you, else Google's quiet renew. */
async function renewQuietly(): Promise<boolean> {
  if (await passFromServer()) return true;
  try { await signInToDrive(); return true; } catch { return false; } // the indicator offers Connect
}
function setDriveToken(token: string, expiresIn: number) {
  accessToken = token;
  tokenExpiry = Date.now() + (Number(expiresIn || 3600) - 60) * 1000;
  try { localStorage.setItem(CONNECTED_FLAG, '1'); } catch { /* ignore */ }
  keepToken();
}

export function currentDriveToken(): string | null {
  if (!accessToken || Date.now() > tokenExpiry) return null;
  return accessToken;
}

function loadGsi(): Promise<void> {
  const w = window as any;
  if (w.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google sign-in couldn't load. Check the connection and try again."));
    document.head.appendChild(s);
  });
}

/** Must run from a click: Google opens its sign-in popup. */
export async function signInToDrive(): Promise<void> {
  await loadGsi();
  const g = (window as any).google;
  await new Promise<void>((resolve, reject) => {
    tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (res: any) => {
        if (res.error) { reject(new Error(res.error_description || res.error)); return; }
        accessToken = res.access_token;
        tokenExpiry = Date.now() + (Number(res.expires_in || 3600) - 60) * 1000;
        try { localStorage.setItem(CONNECTED_FLAG, '1'); } catch { /* ignore */ }
        keepToken();
        resolve();
      },
      error_callback: (err: any) => reject(new Error(err?.message || 'Sign-in was closed')),
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function wasConnectedBefore(): boolean {
  try { return localStorage.getItem(CONNECTED_FLAG) === '1'; } catch { return false; }
}

// The app-wide instance, set up by initStorage() on the web.
let appSync: DriveSync | null = null;
export function setAppDriveSync(s: DriveSync) { appSync = s; }
export function appDriveSync(): DriveSync | null { return appSync; }

/** At start: connected before → use the kept token, or reconnect quietly; nothing to do for someone who never connected. */
export async function resumeDrive(): Promise<boolean> {
  if (!appSync || (!wasConnectedBefore() && !signedInHere())) return false;
  try {
    if (!currentDriveToken()) { if (!await renewQuietly()) throw new Error('not connected'); }
    else keepToken();
    await appSync.connect();
    return true;
  } catch { return false; } // the indicator stays "Connect" — one click, as before
}

/** The menu-bar button: sign in (from the click) and sync. */
export async function connectDrive(): Promise<void> {
  if (!appSync) return;
  try {
    useDriveStatus.getState().set({ state: 'connecting', message: '' });
    if (await checkOneStep()) await signInWithGoogle(); // one Google window: signed in, and Drive connected for good
    else await signInToDrive();
    await appSync.connect();
  } catch (e) {
    useDriveStatus.getState().set({ state: 'ready', message: e instanceof Error ? e.message : String(e) });
  }
}

/* ── Stay connected, for good (Christian 2026-11-16: "I shouldn't have to click connect to Google Drive … Once I'm connected, it
   just stays connected") ──
   Google's browser-only pass lasts an hour, and its quiet renew needs a pop-up the browser blocks. So where the co-writing server
   is set up, signing in is ONE Google window: it signs you in there (Share, your initials at the top) and hands the server Google's
   one-time code, which the server swaps for a lasting Drive pass and keeps, encrypted (collab-server/src/services/driveTokens.ts).
   From then on a fresh one-hour pass comes from the server whenever one is needed — at start, before the hour is up, when the tab
   comes back, and when Drive says the pass has run out. */
const FORCE_CONSENT = 'screenplays:driveConsentNext';
const SIGNIN_SCOPES = `openid email profile ${DRIVE_SCOPE}`;
let fetchServer: typeof fetch = (...a) => fetch(...a);
/** Tests: a fake co-writing server and a fake Google sign-in. */
export function _setDriveServerTestHooks(h: { fetch?: typeof fetch; gsi?: any }) {
  if (h.fetch) fetchServer = h.fetch;
  if (h.gsi) (window as any).google = h.gsi;
}

/** Tools › Google Drive and the initials menu: where Drive stands, in a few words. */
export function driveMenuLabel(state: DriveState): string {
  return state === 'synced' ? 'Google Drive: saved'
    : state === 'saving' ? 'Google Drive: saving…'
    : state === 'connecting' ? 'Google Drive: connecting…'
    : state === 'expired' ? 'Reconnect Google Drive'
    : state === 'error' ? 'Google Drive: problem — try again'
    : 'Connect Google Drive…';
}

/** Signing in is one Google window (the co-writing server keeps Drive connected) — once the server says it can (/auth/config). */
let stayConnectedOnServer: boolean | null = null;
export const oneStepSignIn = () => !!collabServerHttp() && stayConnectedOnServer !== false;
/** Ask the co-writing server once whether it keeps Drive connected (a server without the Google secret yet: the old way). */
export async function checkOneStep(): Promise<boolean> {
  if (!collabServerHttp()) return false;
  if (stayConnectedOnServer === null) {
    try {
      const r = await fetchServer(`${collabServerHttp()}/auth/config`);
      stayConnectedOnServer = r.ok ? !!((await r.json()) as { googleStayConnected?: boolean }).googleStayConnected : false;
    } catch { return false; } // unreachable now — ask again next time
  }
  return stayConnectedOnServer;
}
const signedInHere = () => { const a = useSettingsStore.getState().collabAuth; return !!(a.accessToken || a.refreshToken); };

/** A fresh one-hour Drive pass from the co-writing server, if it keeps one for you. Never asks anything. */
export async function passFromServer(): Promise<boolean> {
  if (!oneStepSignIn() || !signedInHere()) return false;
  try {
    if (await ensureCollabAuthenticated() !== 'ok') return false;
    const r = await fetchServer(`${collabServerHttp()}/api/drive/token`, { method: 'POST', headers: { authorization: `Bearer ${useSettingsStore.getState().collabAuth.accessToken}` } });
    if (!r.ok) return false; // 409: not kept (or Google ended it) — the indicator offers Sign in
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return false;
    setDriveToken(j.access_token, j.expires_in || 3600);
    return true;
  } catch { return false; }
}

/** Must run from a click: one Google window — signed in to co-writing, and Drive connected for good. */
export async function signInWithGoogle(): Promise<void> {
  await loadGsi();
  const g = (window as any).google;
  let consent = false;
  try { consent = !wasConnectedBefore() || localStorage.getItem(FORCE_CONSENT) === '1'; } catch { /* ignore */ }
  const code = await new Promise<string>((resolve, reject) => {
    const client = g.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SIGNIN_SCOPES,
      ux_mode: 'popup',
      ...(consent ? { prompt: 'consent' } : {}), // the first time: Google's consent screen, which always gives the lasting pass
      callback: (res: any) => { if (res.error || !res.code) reject(new Error(res.error_description || res.error || 'Google gave no code')); else resolve(res.code); },
      error_callback: (err: any) => reject(new Error(err?.message || 'Sign-in was closed')),
    });
    client.requestCode();
  });
  const r = await fetchServer(`${collabServerHttp()}/auth/google-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const j = (await r.json().catch(() => ({}))) as AuthResponse & { error?: string; drive?: { connected: boolean; access_token?: string; expires_in?: number; needsConsent?: boolean; error?: string } };
  if (!r.ok) throw new Error(j.error || `The co-writing server answered ${r.status}`);
  handleAuthResponse(j);
  try { localStorage.removeItem(FORCE_CONSENT); } catch { /* ignore */ }
  if (j.drive?.connected && j.drive.access_token) { setDriveToken(j.drive.access_token, j.drive.expires_in || 3600); return; }
  if (j.drive?.connected && await passFromServer()) return;
  if (j.drive?.needsConsent) { try { localStorage.setItem(FORCE_CONSENT, '1'); } catch { /* ignore */ } }
  throw new Error(j.drive?.needsConsent ? "You're signed in — press Sign in once more to finish connecting Google Drive" : (j.drive?.error || "Google Drive didn't connect"));
}

/* Renew when it matters: the tab comes back (timers sleep in background tabs), or Drive said the pass ran out. */
let lastExpiredTry = 0;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !appSync || !wasConnectedBefore()) return;
    if (tokenExpiry - Date.now() < 120000) void renewQuietly().then((ok) => { if (ok) void appSync?.connect(); });
  });
  useDriveStatus.subscribe((st) => {
    if (st.state !== 'expired' || !appSync || Date.now() - lastExpiredTry < 60000) return;
    lastExpiredTry = Date.now();
    void passFromServer().then((ok) => { if (ok) void appSync?.connect(); });
  });
}
