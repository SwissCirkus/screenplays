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

export const GOOGLE_CLIENT_ID = '137075271992-st7deo4q3m0pptfo02ep31638bj07tor.apps.googleusercontent.com'; // same client as Schedule
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'Screenplays';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CONNECTED_FLAG = 'screenplays:driveConnected';
const DIRTY_KEY = 'drive/dirty';
const MAP_KEY = 'drive/map';

// ── Transport (fetch in the app, a fake in tests) ───────────────────────────

export interface DriveFile { id: string; name: string; appProperties?: Record<string, string>; parents?: string[] }
export interface DriveMeta { name?: string; mimeType?: string; parents?: string[]; appProperties?: Record<string, string> }
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
  async function subFolder(kind: 'versions' | 'assets', pid: string, projectName: string): Promise<string> {
    const key = `${kind}|${pid}`;
    const existing = await locate(key, { sp: kind, spId: pid });
    if (existing) return existing;
    return put(key, { sp: kind, spId: pid }, await projectFolder(pid, projectName), kind, undefined, undefined, true);
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
    const content = (await kv.get(keys.content(sid))) ?? null;
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
    const folder = await subFolder('assets', pid, rec.info.name);
    await put(`asset|${aid}`, { sp: 'asset', spId: aid, spProject: pid }, folder, safeName(a.meta.original_name, a.meta.filename), a.blob, a.meta.mime_type);
  }

  async function pushTemplates() {
    const list = (await kv.get<any[]>(keys.templates)) ?? [];
    await put('templates', { sp: 'templates' }, await rootFolder(), 'templates.json', JSON.stringify(list));
  }

  async function pushUnit(key: string, deleted: boolean) {
    const [kind, a, b] = key.split('|');
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
  async function pull(): Promise<number> {
    let changedCount = 0;
    const pending = new Set((await dirtyList()).map((k) => k.replace(/^-/, '')));
    for (const f of await transport.find({ sp: 'projectjson' })) {
      const remote = await readJson<ProjectFile>(f.id);
      if (!remote?.info?.id) continue;
      const pid = remote.info.id;
      await remember(`projectjson|${pid}`, f.id);
      if (f.parents?.[0]) await remember(`folder|${pid}`, f.parents[0]);
      const local = await kv.get<ProjectRecord>(keys.project(pid));
      const remoteNewer = !local || remote.info.updated_at > local.info.updated_at;
      if (remoteNewer && !pending.has(`project|${pid}`)) {
        await kv.put(keys.project(pid), { info: remote.info, locations: remote.locations ?? [] } satisfies ProjectRecord);
        changedCount++;
      }

      // Scripts: newer copy wins, script by script.
      const remoteIds = new Set<string>();
      for (const meta of remote.scripts ?? []) {
        remoteIds.add(meta.id);
        if (pending.has(`script|${pid}|${meta.id}`)) continue;
        const mine = await kv.get<ScriptMeta>(keys.script(pid, meta.id));
        if (mine && mine.updated_at >= meta.updated_at) continue;
        const sf = await locate(`script|${meta.id}`, { sp: 'script', spId: meta.id });
        if (!sf) continue;
        const body = await readJson<{ meta: ScriptMeta; content: unknown }>(sf);
        if (!body) continue;
        await kv.put(keys.content(meta.id), body.content ?? null);
        await kv.put(keys.script(pid, meta.id), body.meta ?? meta);
        changedCount++;
      }
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

      // Versions: add any this browser hasn't seen.
      for (const vf of await transport.find({ sp: 'version', spProject: pid })) {
        const vid = vf.appProperties?.spId;
        if (!vid || (await kv.get(keys.version(pid, vid)))) continue;
        const v = await readJson<VersionRecord>(vf.id);
        if (!v) continue;
        await kv.put(keys.version(pid, vid), v);
        await remember(`version|${vid}`, vf.id);
        changedCount++;
      }

      // Assets listed in project.json that this browser doesn't have.
      for (const am of remote.assets ?? []) {
        if (await kv.get(keys.asset(pid, am.id))) continue;
        const af = await locate(`asset|${am.id}`, { sp: 'asset', spId: am.id });
        if (!af) continue;
        try {
          const blob = await transport.download(af);
          await kv.put(keys.asset(pid, am.id), { meta: am, blob } satisfies AssetRecord);
          changedCount++;
        } catch (e) { if (e instanceof DriveAuthError) throw e; console.warn('[drive] asset skipped', am.id, e); }
      }
    }

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
        await pushUnit(key.replace(/^-/, ''), key.startsWith('-'));
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
      running = running.then(async () => {
        const list = (await dirtyList()).filter((k) => k !== key && k !== `-${key}`);
        // A deleted project also drops its queued children.
        const kept = deleted && unit.kind === 'project'
          ? list.filter((k) => !k.replace(/^-/, '').includes(`|${unit.projectId}`))
          : list;
        kept.push(deleted ? `-${key}` : key);
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
  };
}

export type DriveSync = ReturnType<typeof createDriveSync>;

// ── Google sign-in (browser only) ───────────────────────────────────────────

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

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

/** The menu-bar button: sign in (from the click) and sync. */
export async function connectDrive(): Promise<void> {
  if (!appSync) return;
  try {
    useDriveStatus.getState().set({ state: 'connecting', message: '' });
    await signInToDrive();
    await appSync.connect();
  } catch (e) {
    useDriveStatus.getState().set({ state: 'ready', message: e instanceof Error ? e.message : String(e) });
  }
}
