/**
 * File › Backup (SwissCirkus, Christian 2026-11-16: "just have file backup … you can set it to a location, and it saves all your
 * scripts and drafts into a zip … essentially a shortcut for export everything").
 *
 * One zip with everything in the library:
 *   backup.json                          what this is, when it was made, which projects are in it
 *   <Project>.zip                        each project exactly as Export Project makes it — Import Project reads it back
 *   versions/<Project>/<date — note>/    each saved version of each script, as it was then (<script>.json)
 *
 * Where it goes: a folder you choose once (Chrome and Edge — the browser remembers it, and may ask once a visit to allow it).
 * Where a browser can't write to a folder (Safari, Firefox) the zip is downloaded to the browser's download folder.
 */
import JSZip from 'jszip';
import { api } from './api';
import type { ProjectInfo, ScriptMeta, ScriptResponse, VersionInfo } from './api';
import { buildProjectZip, sanitizeFilename, type ZipExportClient } from '../utils/zipExport';

export interface BackupClient extends ZipExportClient {
  listProjects: () => Promise<ProjectInfo[]>;
  getVersions?: (projectId: string) => Promise<VersionInfo[]>;
  getScriptAtVersion?: (projectId: string, hash: string, scriptId: string) => Promise<ScriptResponse>;
}

export interface BackupResult {
  data: Uint8Array;
  filename: string;
  projects: number;
  scripts: number;
  versions: number;
  /** Projects that couldn't be read — the backup says so rather than looking complete. */
  failed: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "Screenplays backup 2026-11-16 1432.zip" */
export function backupFilename(d = new Date()): string {
  return `Screenplays backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}

function uniqueName(base: string, used: Set<string>): string {
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base} (${i++})`;
  used.add(n.toLowerCase());
  return n;
}

export async function buildFullBackup(client: BackupClient = api as unknown as BackupClient, now = new Date()): Promise<BackupResult> {
  const projects = await client.listProjects();
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  const listed: { name: string; file: string; scripts: number; versions: number }[] = [];
  let scriptCount = 0, versionCount = 0;

  for (const p of projects) {
    const name = uniqueName(sanitizeFilename(p.name || 'Project'), used);
    let metas: ScriptMeta[] = [];
    try {
      const { data } = await buildProjectZip(p.id, client);
      zip.file(`${name}.zip`, data);
      metas = await client.listScripts(p.id);
      scriptCount += metas.length;
    } catch (err) {
      console.error('[backup] could not read project', p.id, err);
      failed.push(p.name || 'Project');
      continue;
    }

    // saved versions: each script as it was at each one (a version a script didn't exist in is skipped)
    let vCount = 0;
    if (client.getVersions && client.getScriptAtVersion && metas.length) {
      let versions: VersionInfo[] = [];
      try { versions = await client.getVersions(p.id); } catch { versions = []; }
      const vUsed = new Set<string>();
      for (const v of versions) {
        const when = (v.date || '').slice(0, 16).replace('T', ' ').replace(':', '');
        const folder = uniqueName(sanitizeFilename(`${when} — ${(v.message || v.short_hash || 'version').slice(0, 60)}`), vUsed);
        let any = false;
        const sUsed = new Set<string>();
        for (const m of metas) {
          try {
            const s = await client.getScriptAtVersion(p.id, v.hash, m.id);
            zip.file(`versions/${name}/${folder}/${uniqueName(sanitizeFilename(m.title || 'Untitled'), sUsed)}.json`, JSON.stringify(s.content || {}, null, 2));
            any = true;
          } catch { /* not in that version */ }
        }
        if (any) vCount++;
      }
    }
    versionCount += vCount;
    listed.push({ name: p.name, file: `${name}.zip`, scripts: metas.length, versions: vCount });
  }

  zip.file('backup.json', JSON.stringify({
    kind: 'screenplays-backup', backup_version: 1, created: now.toISOString(),
    projects: listed, ...(failed.length ? { unreadable_projects: failed } : {}),
  }, null, 2));
  const data = await zip.generateAsync({ type: 'uint8array' });
  return { data, filename: backupFilename(now), projects: listed.length, scripts: scriptCount, versions: versionCount, failed };
}

/* ── The backup folder (browsers that can write to a folder: Chrome, Edge) ── */

type DirHandle = {
  name: string;
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  getFileHandle: (name: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (d: BlobPart) => Promise<void>; close: () => Promise<void> }> }>;
};
type PickerWindow = { showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle> };

/** Can this browser save into a folder you choose? (Chrome and Edge can; Safari and Firefox can't.) */
export const canPickFolder = () => typeof window !== 'undefined' && typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function';

const IDB = 'screenplays-backup', STORE = 'folder', KEY = 'dir';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise<T>((res, rej) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => res(q.result as T);
    q.onerror = () => rej(q.error);
  });
}

let testFolder: DirHandle | null | undefined;
/** Tests: a fake folder (null = none chosen). */
export function _setBackupTestFolder(h: DirHandle | null) { testFolder = h; }

export async function savedFolder(): Promise<DirHandle | null> {
  if (testFolder !== undefined) return testFolder;
  try { return (await idbDo<DirHandle | undefined>('readonly', (s) => s.get(KEY))) || null; } catch { return null; }
}
/** The name of the chosen backup folder, or null. */
export async function backupFolderName(): Promise<string | null> { return (await savedFolder())?.name || null; }

/** Ask for the folder backups go into (and remember it). Null when you cancel. */
export async function chooseBackupFolder(): Promise<DirHandle | null> {
  const pick = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!pick) return null;
  let h: DirHandle;
  try { h = await pick({ id: 'screenplays-backup', mode: 'readwrite' }); } catch { return null; }
  if (testFolder !== undefined) testFolder = h;
  else { try { await idbDo('readwrite', (s) => s.put(h, KEY)); } catch { /* still used this time */ } }
  return h;
}

export type BackupOutcome =
  | { where: 'folder'; folder: string; result: BackupResult }
  | { where: 'download'; result: BackupResult }
  | { where: 'cancelled' };

/**
 * File › Backup: make the zip and put it in the backup folder — asking for the folder the first time, and for permission
 * again when the browser has forgotten it. Browsers without folders: the zip downloads.
 */
export async function runBackup(client?: BackupClient, deps: { download?: (d: Uint8Array, name: string) => Promise<boolean> } = {}): Promise<BackupOutcome> {
  let folder: DirHandle | null = null;
  if (canPickFolder()) {
    folder = await savedFolder();
    if (folder?.queryPermission && (await folder.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      const ok = folder.requestPermission ? await folder.requestPermission({ mode: 'readwrite' }).catch(() => 'denied' as PermissionState) : 'denied';
      if (ok !== 'granted') folder = null;
    }
    if (!folder) folder = await chooseBackupFolder();
    if (!folder) return { where: 'cancelled' };
  }
  const result = await buildFullBackup(client);
  if (folder) {
    const fh = await folder.getFileHandle(result.filename, { create: true });
    const w = await fh.createWritable();
    await w.write(result.data as BlobPart);
    await w.close();
    return { where: 'folder', folder: folder.name, result };
  }
  const download = deps.download || (async (d: Uint8Array, n: string) => (await import('../utils/fileOps')).saveFile(d, n, [{ name: 'ZIP Archive', extensions: ['zip'] }]));
  return (await download(result.data, result.filename)) ? { where: 'download', result } : { where: 'cancelled' };
}
