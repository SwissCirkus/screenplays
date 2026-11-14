/**
 * Browser library — SwissCirkus fork.
 *
 * Mirrors every method of `api` (api.ts) like local-storage.ts does for
 * SQLite, but keeps the library in the browser (kvStore.ts → IndexedDB).
 * Every change is reported through `onChange` so driveSync.ts can mirror it
 * to the writer's Google Drive. No Python server is involved.
 *
 * Keys:
 *   p/<projectId>                 { info: ProjectInfo, locations: LocationEntry[] }
 *   s/<projectId>/<scriptId>      ScriptMeta
 *   c/<scriptId>                  script content (TipTap JSON) or null
 *   v/<projectId>/<versionId>     VersionRecord (a full snapshot of every script)
 *   a/<projectId>/<assetId>       AssetRecord (meta + Blob)
 *   t                             formatting templates
 */

import { prepareReviewSave } from '../utils/reviewSave';
import { isDestructiveEmptyOverwrite } from '../utils/docText';
import { looksLikeTreatment, normalizeFormat } from '../utils/scriptFormat';
import type { KvStore } from './kvStore';
import type {
  ProjectInfo,
  ProjectProperties,
  ScriptMeta,
  ScriptResponse,
  VersionInfo,
  DiffResponse,
  CollabSession,
  LinkPreview,
  LocationEntry,
  DemoInfo,
} from './api';

export interface ProjectRecord { info: ProjectInfo; locations: LocationEntry[] }
export interface VersionScript { script_id: string; title: string; content: string; content_hash: string }
export interface VersionRecord { id: string; message: string; created_at: string; scripts: VersionScript[] }
export interface AssetMeta {
  id: string; filename: string; original_name: string; mime_type: string;
  size_bytes: number; tags: string[]; created_at: string;
}
export interface AssetRecord { meta: AssetMeta; blob: Blob }

/** What changed, so the Drive mirror knows which file to rewrite or remove. */
export type ChangeUnit =
  | { kind: 'project'; projectId: string; deleted?: boolean }
  | { kind: 'script'; projectId: string; scriptId: string; deleted?: boolean }
  | { kind: 'version'; projectId: string; versionId: string; deleted?: boolean }
  | { kind: 'asset'; projectId: string; assetId: string; deleted?: boolean }
  | { kind: 'templates' };

/** URL scheme the editor's image loader resolves through `fetchWebAsset`. */
export const WEB_ASSET_PREFIX = 'webasset:';

export const EMPTY_PROPS: ProjectProperties = {
  genre: '', logline: '', synopsis: '', author: '', contact: '',
  copyright: '', draft: '', language: 'en', format: 'screenplay',
  production_company: '', director: '', producer: '', status: '',
  target_length: '', notes: '',
  wga_registration: '', wga_registration_date: '',
  copyright_registration: '', copyright_year: '',
  agent_name: '', agent_contact: '',
  manager_name: '', manager_contact: '',
  submissions: [],
};

export const keys = {
  project: (p: string) => `p/${p}`,
  script: (p: string, s: string) => `s/${p}/${s}`,
  scripts: (p: string) => `s/${p}/`,
  content: (s: string) => `c/${s}`,
  version: (p: string, v: string) => `v/${p}/${v}`,
  versions: (p: string) => `v/${p}/`,
  asset: (p: string, a: string) => `a/${p}/${a}`,
  assets: (p: string) => `a/${p}/`,
  templates: 't',
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* secure context required */ }
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Strictly increasing ISO timestamps, so two quick writes never share one. */
let lastTs = 0;
function now(): string {
  const t = Math.max(Date.now(), lastTs + 1);
  lastTs = t;
  return new Date(t).toISOString();
}

const shortHash = (id: string) => id.slice(0, 7);

async function contentHash(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function byteSize(str: string | null): number {
  return str ? new TextEncoder().encode(str).length : 0;
}

// ── Locations (same rules as the server's location_service.py) ──────────────

const PREFIX_RE = /^(INT\.?\/?EXT\.?|EXT\.?\/?INT\.?|INT\.?|EXT\.?|I\/E\.?)\s+/i;
const TIME_WORDS_RE = /(?:\s+-\s+|\.\s*)(DAY|NIGHT|DAWN|DUSK|MORNING|AFTERNOON|EVENING|SUNSET|SUNRISE|LATER|CONTINUOUS|SAME TIME|MOMENTS LATER|SAME|MAGIC HOUR)\.?$/i;

export function normalizeLocationName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function parseLocationFromHeading(heading: string): { name: string; type: LocationEntry['type'] } {
  let text = heading.trim();
  let type: LocationEntry['type'] | '' = '';
  const m = PREFIX_RE.exec(text);
  if (m) {
    const raw = m[1].toUpperCase().replace(/\.+$/, '');
    type = raw.includes('/') ? 'both' : raw.startsWith('INT') ? 'interior' : raw.startsWith('EXT') ? 'exterior' : '';
    text = text.slice(m[0].length);
  }
  text = text.replace(TIME_WORDS_RE, '');
  const name = text.replace(/^[\s.]+|[\s.]+$/g, '').trim();
  return { name, type: type || 'interior' };
}

function* sceneHeadings(node: unknown): Generator<string> {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; content?: unknown[]; text?: string };
  if (n.type === 'sceneHeading') {
    yield (n.content || []).map((c: any) => (c && c.type === 'text' ? c.text || '' : '')).join('');
  }
  for (const child of n.content || []) yield* sceneHeadings(child);
}

function blankLocation(name: string, type: LocationEntry['type'], ts: string): LocationEntry {
  return {
    id: `loc-${uuid().replace(/-/g, '').slice(0, 12)}`,
    name, fullName: '', type, address: '', notes: '', contact: '', availability: '',
    tags: [], imageAssetIds: [], aliases: [], created_at: ts, updated_at: ts,
  };
}

// ── Public factory ───────────────────────────────────────────────────────────

export interface WebStorageOptions {
  onChange?: (unit: ChangeUnit) => void;
  /**
   * A script whose text isn't in this browser yet (only its name came in from Drive — driveSync's quick first pass):
   * fetch it now. Resolves to its content, or undefined when there's nothing to fetch.
   */
  loadMissingContent?: (projectId: string, scriptId: string) => Promise<Record<string, unknown> | null | undefined>;
}

export function createWebStorage(kv: KvStore, opts: WebStorageOptions = {}) {
  const changed = (unit: ChangeUnit) => { try { opts.onChange?.(unit); } catch (e) { console.error('[web-storage] onChange failed', e); } };

  async function readProject(id: string): Promise<ProjectRecord> {
    const rec = await kv.get<ProjectRecord>(keys.project(id));
    if (!rec) throw new Error(`Project not found: ${id}`);
    return rec;
  }

  async function touchProject(id: string, ts: string): Promise<void> {
    const rec = await kv.get<ProjectRecord>(keys.project(id));
    if (!rec) return;
    rec.info.updated_at = ts;
    await kv.put(keys.project(id), rec);
    changed({ kind: 'project', projectId: id });
  }

  /** A script's text — fetched first when only its name has come in from Drive so far. */
  async function contentOf(projectId: string, scriptId: string): Promise<unknown> {
    const stored = await kv.get(keys.content(scriptId));
    if (stored === undefined && opts.loadMissingContent) return opts.loadMissingContent(projectId, scriptId);
    return stored;
  }

  async function readMeta(projectId: string, scriptId: string): Promise<ScriptMeta> {
    const meta = await kv.get<ScriptMeta>(keys.script(projectId, scriptId));
    if (!meta) throw new Error(`Script not found: ${scriptId}`);
    return meta;
  }

  async function allScripts(projectId: string): Promise<ScriptMeta[]> {
    const ks = await kv.keys(keys.scripts(projectId));
    const metas = await Promise.all(ks.map((k) => kv.get<ScriptMeta>(k)));
    return metas.filter((m): m is ScriptMeta => !!m);
  }

  async function allVersions(projectId: string): Promise<VersionRecord[]> {
    const ks = await kv.keys(keys.versions(projectId));
    const recs = await Promise.all(ks.map((k) => kv.get<VersionRecord>(k)));
    return recs.filter((r): r is VersionRecord => !!r).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function readVersion(projectId: string, versionId: string): Promise<VersionRecord> {
    const rec = await kv.get<VersionRecord>(keys.version(projectId, versionId));
    if (!rec) throw new Error(`Version not found: ${versionId}`);
    return rec;
  }

  async function newScript(projectId: string, title: string, content: Record<string, unknown> | null, format: string | undefined): Promise<ScriptResponse> {
    const id = uuid();
    const ts = now();
    const stored = content ? prepareReviewSave(content) : null;
    const contentStr = stored ? JSON.stringify(stored) : null;
    const meta: ScriptMeta = {
      id, title, author: '', format: normalizeFormat(format),
      created_at: ts, updated_at: ts, page_count: 0, size_bytes: byteSize(contentStr),
      color: '', pinned: false, sort_order: 0, preview: '',
    };
    await kv.put(keys.content(id), stored);
    await kv.put(keys.script(projectId, id), meta);
    changed({ kind: 'script', projectId, scriptId: id });
    await touchProject(projectId, ts);
    return { meta, content: content ?? null };
  }

  const storage = {
    // Demo mode never applies to the browser library.
    async getDemoInfo(): Promise<DemoInfo> { return { demo: false, message: null }; },

    // ── Projects ───────────────────────────────────────────────────────────

    async listProjects(): Promise<ProjectInfo[]> {
      const ks = await kv.keys('p/');
      const recs = await Promise.all(ks.map((k) => kv.get<ProjectRecord>(k)));
      return recs
        .filter((r): r is ProjectRecord => !!r)
        .map((r) => r.info)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    async createProject(name: string): Promise<ProjectInfo> {
      const id = uuid();
      const ts = now();
      const info: ProjectInfo = {
        id, name, created_at: ts, updated_at: ts, properties: { ...EMPTY_PROPS, submissions: [] },
        color: '', pinned: false, sort_order: 0,
      };
      await kv.put(keys.project(id), { info, locations: [] } satisfies ProjectRecord);
      changed({ kind: 'project', projectId: id });
      return info;
    },

    async getProject(id: string): Promise<ProjectInfo> {
      return (await readProject(id)).info;
    },

    async updateProject(
      id: string,
      data: { name?: string; properties?: Partial<ProjectProperties>; color?: string; pinned?: boolean; sort_order?: number },
    ): Promise<ProjectInfo> {
      const rec = await readProject(id);
      const old = rec.info;
      rec.info = {
        ...old,
        name: data.name ?? old.name,
        properties: data.properties ? { ...old.properties, ...data.properties } : old.properties,
        color: data.color ?? old.color,
        pinned: data.pinned ?? old.pinned,
        sort_order: data.sort_order ?? old.sort_order,
        updated_at: now(),
      };
      await kv.put(keys.project(id), rec);
      changed({ kind: 'project', projectId: id });
      return rec.info;
    },

    async deleteProject(id: string): Promise<{ message: string }> {
      for (const meta of await allScripts(id)) {
        await kv.delete(keys.content(meta.id));
        await kv.delete(keys.script(id, meta.id));
      }
      for (const k of await kv.keys(keys.versions(id))) await kv.delete(k);
      for (const k of await kv.keys(keys.assets(id))) await kv.delete(k);
      await kv.delete(keys.project(id));
      changed({ kind: 'project', projectId: id, deleted: true });
      // i18n-ignore status payload returned by the storage layer, never shown
      return { message: 'deleted' };
    },

    async reorderProjects(items: Array<{ id: string; sort_order: number }>): Promise<{ message: string }> {
      for (const item of items) {
        const rec = await kv.get<ProjectRecord>(keys.project(item.id));
        if (!rec) continue;
        rec.info.sort_order = item.sort_order;
        await kv.put(keys.project(item.id), rec);
        changed({ kind: 'project', projectId: item.id });
      }
      // i18n-ignore status payload returned by the storage layer, never shown
      return { message: 'ok' };
    },

    // ── Scripts ────────────────────────────────────────────────────────────

    async listScripts(projectId: string, _includePreview = false): Promise<ScriptMeta[]> {
      return (await allScripts(projectId)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async createScript(
      projectId: string,
      data: { title: string; content?: any; format?: string; skipFileSync?: boolean },
    ): Promise<ScriptResponse> {
      await readProject(projectId);
      return newScript(projectId, data.title, data.content ?? null, data.format);
    },

    async getScript(projectId: string, scriptId: string): Promise<ScriptResponse> {
      const meta = await readMeta(projectId, scriptId);
      let stored = await kv.get<Record<string, unknown> | null>(keys.content(scriptId));
      // Only the name is here so far (it came from Drive, its text is still on its way): fetch the text now.
      if (stored === undefined && opts.loadMissingContent) stored = await opts.loadMissingContent(projectId, scriptId);
      return { meta, content: stored ?? null };
    },

    async saveScript(
      projectId: string,
      scriptId: string,
      data: { title?: string; content?: Record<string, unknown>; color?: string; pinned?: boolean; sort_order?: number; allowEmptyBody?: boolean; skipFileSync?: boolean },
    ): Promise<ScriptResponse> {
      const existing = await storage.getScript(projectId, scriptId);
      const title = data.title ?? existing.meta.title;
      // Same data-loss guard as the desktop library: an editor that reset
      // must not save an empty document over a written script.
      if (isDestructiveEmptyOverwrite(data.content, existing.content, data.allowEmptyBody)) {
        throw new Error(
          `Refusing to overwrite "${title}" with an empty document — the saved script has content but the ` +
          `incoming one has none. This guards against accidental data loss (the editor may have reset). ` +
          `If you really meant to clear it, delete the script instead.`,
        );
      }
      const content = prepareReviewSave(data.content ?? existing.content);
      const ts = now();
      const meta: ScriptMeta = {
        ...existing.meta,
        title,
        size_bytes: byteSize(content ? JSON.stringify(content) : null),
        color: data.color ?? existing.meta.color,
        pinned: data.pinned ?? existing.meta.pinned,
        sort_order: data.sort_order ?? existing.meta.sort_order,
        updated_at: ts,
      };
      // Content first, then metadata: a failure in between leaves the old
      // updated_at, never a newer stamp over older text.
      if (data.content !== undefined) await kv.put(keys.content(scriptId), content);
      await kv.put(keys.script(projectId, scriptId), meta);
      changed({ kind: 'script', projectId, scriptId });
      await touchProject(projectId, ts);
      return { meta, content };
    },

    async reorderScripts(projectId: string, items: Array<{ id: string; sort_order: number }>): Promise<{ message: string }> {
      for (const item of items) {
        const meta = await kv.get<ScriptMeta>(keys.script(projectId, item.id));
        if (!meta) continue;
        meta.sort_order = item.sort_order;
        await kv.put(keys.script(projectId, item.id), meta);
        changed({ kind: 'script', projectId, scriptId: item.id });
      }
      // i18n-ignore status payload returned by the storage layer, never shown
      return { message: 'ok' };
    },

    async duplicateScript(projectId: string, scriptId: string): Promise<ScriptResponse> {
      const original = await storage.getScript(projectId, scriptId);
      return newScript(
        projectId,
        `${original.meta.title} (Copy)`,
        original.content ? structuredClone(original.content) : null,
        original.meta.format,
      );
    },

    async deleteScript(projectId: string, scriptId: string): Promise<{ message: string }> {
      await kv.delete(keys.content(scriptId));
      await kv.delete(keys.script(projectId, scriptId));
      changed({ kind: 'script', projectId, scriptId, deleted: true });
      await touchProject(projectId, now());
      // i18n-ignore status payload returned by the storage layer, never shown
      return { message: 'deleted' };
    },

    // ── Versions (one full snapshot per check-in) ─────────────────────────

    async checkin(projectId: string, message: string): Promise<VersionInfo> {
      await readProject(projectId);
      const scripts: VersionScript[] = [];
      for (const meta of await allScripts(projectId)) {
        const content = (await contentOf(projectId, meta.id)) ?? null;
        const contentStr = content ? JSON.stringify(content) : '';
        scripts.push({ script_id: meta.id, title: meta.title, content: contentStr, content_hash: await contentHash(contentStr) });
      }
      const rec: VersionRecord = { id: uuid(), message, created_at: now(), scripts };
      await kv.put(keys.version(projectId, rec.id), rec);
      changed({ kind: 'version', projectId, versionId: rec.id });
      return { hash: rec.id, short_hash: shortHash(rec.id), message, date: rec.created_at };
    },

    async getVersions(projectId: string, scriptId?: string): Promise<VersionInfo[]> {
      return (await allVersions(projectId))
        .filter((v) => !scriptId || v.scripts.some((s) => s.script_id === scriptId))
        .map((v) => ({ hash: v.id, short_hash: shortHash(v.id), message: v.message, date: v.created_at }));
    },

    async getVersionDiff(projectId: string, fromHash: string, toHash: string): Promise<DiffResponse> {
      const [from, to] = await Promise.all([readVersion(projectId, fromHash), readVersion(projectId, toHash)]);
      const fromMap = new Map(from.scripts.map((s) => [s.script_id, s]));
      const toMap = new Map(to.scripts.map((s) => [s.script_id, s]));
      const lines: string[] = [];
      for (const sid of new Set([...fromMap.keys(), ...toMap.keys()])) {
        const f = fromMap.get(sid);
        const t = toMap.get(sid);
        const title = t?.title || f?.title || sid;
        if (!f && t) lines.push(`+++ New script: ${title}`);
        else if (f && !t) lines.push(`--- Deleted script: ${title}`);
        else if (f && t && f.content_hash !== t.content_hash) {
          lines.push(`--- ${title}`, `+++ ${title}`, '@@ modified @@');
          const fl = f.content.split('\n');
          const tl = t.content.split('\n');
          for (let i = 0; i < Math.max(fl.length, tl.length); i++) {
            if (fl[i] !== tl[i]) {
              if (fl[i]) lines.push(`-${fl[i]}`);
              if (tl[i]) lines.push(`+${tl[i]}`);
            }
          }
        }
      }
      return { diff: lines.join('\n') || 'No differences found.', from_hash: fromHash, to_hash: toHash };
    },

    async getScriptAtVersion(projectId: string, hash: string, scriptId: string): Promise<ScriptResponse> {
      const rec = await readVersion(projectId, hash);
      const found = rec.scripts.find((s) => s.script_id === scriptId);
      if (!found) throw new Error(`Script ${scriptId} not found in version ${hash}`);
      let content: Record<string, unknown> | null = null;
      if (found.content) { try { content = JSON.parse(found.content); } catch { /* invalid JSON */ } }
      return {
        meta: {
          id: found.script_id, title: found.title, author: '',
          format: looksLikeTreatment(content) ? 'treatment' : 'screenplay',
          created_at: '', updated_at: '', page_count: 0, size_bytes: 0,
          color: '', pinned: false, sort_order: 0, preview: '',
        },
        content,
      };
    },

    async restoreVersion(projectId: string, hash: string): Promise<VersionInfo> {
      const rec = await readVersion(projectId, hash);
      const current = new Map((await allScripts(projectId)).map((m) => [m.id, m]));
      const ts = now();
      const keep = new Set(rec.scripts.map((s) => s.script_id));
      for (const [id] of current) {
        if (keep.has(id)) continue;
        await kv.delete(keys.content(id));
        await kv.delete(keys.script(projectId, id));
        changed({ kind: 'script', projectId, scriptId: id, deleted: true });
      }
      for (const s of rec.scripts) {
        let content: Record<string, unknown> | null = null;
        if (s.content) { try { content = JSON.parse(s.content); } catch { /* keep null */ } }
        const prev = current.get(s.script_id);
        const meta: ScriptMeta = {
          ...(prev ?? {
            id: s.script_id, author: '', created_at: ts, page_count: 0,
            color: '', pinned: false, sort_order: 0, preview: '',
            format: normalizeFormat(looksLikeTreatment(content) ? 'treatment' : undefined),
          }),
          title: s.title,
          size_bytes: byteSize(s.content || null),
          updated_at: ts,
        } as ScriptMeta;
        await kv.put(keys.content(s.script_id), content);
        await kv.put(keys.script(projectId, s.script_id), meta);
        changed({ kind: 'script', projectId, scriptId: s.script_id });
      }
      await touchProject(projectId, ts);
      return { hash, short_hash: shortHash(hash), message: rec.message, date: rec.created_at };
    },

    async deleteVersion(projectId: string, hash: string): Promise<{ message: string }> {
      await readVersion(projectId, hash);
      await kv.delete(keys.version(projectId, hash));
      changed({ kind: 'version', projectId, versionId: hash, deleted: true });
      return { message: `Deleted version ${shortHash(hash)}` };
    },

    // ── Collaboration — needs OpenDraft's collab server, not set up yet ──

    async createCollabInvite(..._args: unknown[]): Promise<CollabSession> {
      throw new Error('Live co-writing is not set up for this library yet. Share the project folder in Google Drive instead.');
    },
    async validateCollabSession(_token: string): Promise<CollabSession> {
      throw new Error('Live co-writing is not set up for this library yet.');
    },
    async listCollabSessions(_projectId: string, _scriptId: string): Promise<CollabSession[]> { return []; },
    async revokeCollabSession(_token: string): Promise<{ message: string }> { return { message: 'ok' }; },
    async revokeAllCollabSessions(_projectId: string, _scriptId: string): Promise<{ message: string }> { return { message: 'ok' }; },

    // ── Assets ─────────────────────────────────────────────────────────────

    async listAssets(projectId: string): Promise<any[]> {
      const ks = await kv.keys(keys.assets(projectId));
      const recs = await Promise.all(ks.map((k) => kv.get<AssetRecord>(k)));
      return recs
        .filter((r): r is AssetRecord => !!r)
        .map((r) => r.meta)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async uploadAsset(projectId: string, file: File, tags: string[] = []): Promise<any> {
      const id = uuid();
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const meta: AssetMeta = {
        id, filename: ext ? `${id}.${ext}` : id, original_name: file.name,
        mime_type: file.type || 'application/octet-stream', size_bytes: file.size, tags, created_at: now(),
      };
      await kv.put(keys.asset(projectId, id), { meta, blob: file } satisfies AssetRecord);
      changed({ kind: 'asset', projectId, assetId: id });
      return meta;
    },

    /** Write an asset under its ORIGINAL id (backup restore keeps image references working). */
    async importAsset(projectId: string, asset: { id: string; filename: string; mime_type: string; bytes: Uint8Array }): Promise<void> {
      if (await kv.get(keys.asset(projectId, asset.id))) return;
      const blob = new Blob([asset.bytes as BlobPart], { type: asset.mime_type || 'application/octet-stream' });
      const meta: AssetMeta = {
        id: asset.id, filename: asset.filename, original_name: asset.filename,
        mime_type: asset.mime_type || 'application/octet-stream', size_bytes: asset.bytes.byteLength, tags: [], created_at: now(),
      };
      await kv.put(keys.asset(projectId, asset.id), { meta, blob } satisfies AssetRecord);
      changed({ kind: 'asset', projectId, assetId: asset.id });
    },

    async getAssetBytes(projectId: string, assetId: string): Promise<Uint8Array> {
      const rec = await kv.get<AssetRecord>(keys.asset(projectId, assetId));
      if (!rec) throw new Error(`Asset not found: ${assetId}`);
      return new Uint8Array(await rec.blob.arrayBuffer());
    },

    async updateAssetTags(projectId: string, assetId: string, tags: string[]): Promise<void> {
      const rec = await kv.get<AssetRecord>(keys.asset(projectId, assetId));
      if (!rec) return;
      rec.meta.tags = tags;
      await kv.put(keys.asset(projectId, assetId), rec);
      changed({ kind: 'asset', projectId, assetId });
    },

    /** Not a network URL: authedFetch hands `webasset:` URLs to `fetchWebAsset`. */
    getAssetUrl: (projectId: string, assetId: string, _filename?: string): string =>
      `${WEB_ASSET_PREFIX}${projectId}/${assetId}`,

    async deleteAsset(projectId: string, assetId: string): Promise<void> {
      await kv.delete(keys.asset(projectId, assetId));
      changed({ kind: 'asset', projectId, assetId, deleted: true });
    },

    /** Read a `webasset:` URL back as a Response, so image loaders treat it like any fetch. */
    async fetchWebAsset(url: string): Promise<Response> {
      const [projectId, assetId] = url.slice(WEB_ASSET_PREFIX.length).split('/');
      const rec = projectId && assetId ? await kv.get<AssetRecord>(keys.asset(projectId, assetId)) : undefined;
      if (!rec) return new Response('', { status: 404 });
      return new Response(rec.blob, { status: 200, headers: { 'Content-Type': rec.meta.mime_type } });
    },

    // A browser can't read other sites; show the bare link.
    async fetchLinkPreview(url: string): Promise<LinkPreview> {
      return { url, title: '', description: '', image: '', site_name: '' };
    },

    // ── Locations ─────────────────────────────────────────────────────────

    async listLocations(projectId: string): Promise<LocationEntry[]> {
      return (await readProject(projectId)).locations;
    },

    async createLocation(projectId: string, data: Partial<LocationEntry> & { name: string }): Promise<LocationEntry> {
      const rec = await readProject(projectId);
      const ts = now();
      const loc: LocationEntry = {
        ...blankLocation(normalizeLocationName(data.name), data.type ?? 'interior', ts),
        ...data,
        name: normalizeLocationName(data.name),
        aliases: (data.aliases ?? []).map(normalizeLocationName),
        created_at: ts, updated_at: ts,
      };
      if (data.id) loc.id = data.id;
      rec.locations.push(loc);
      await kv.put(keys.project(projectId), rec);
      changed({ kind: 'project', projectId });
      return loc;
    },

    async updateLocation(projectId: string, locId: string, data: Partial<LocationEntry>): Promise<LocationEntry> {
      const rec = await readProject(projectId);
      const loc = rec.locations.find((l) => l.id === locId);
      if (!loc) throw new Error(`Location '${locId}' not found`);
      for (const k of ['fullName', 'type', 'address', 'notes', 'contact', 'availability', 'tags', 'imageAssetIds'] as const) {
        if (k in data) (loc as any)[k] = (data as any)[k];
      }
      if (data.name) loc.name = normalizeLocationName(data.name);
      if (data.aliases) loc.aliases = data.aliases.map(normalizeLocationName);
      loc.updated_at = now();
      await kv.put(keys.project(projectId), rec);
      changed({ kind: 'project', projectId });
      return loc;
    },

    async deleteLocation(projectId: string, locId: string): Promise<{ message: string }> {
      const rec = await readProject(projectId);
      const before = rec.locations.length;
      rec.locations = rec.locations.filter((l) => l.id !== locId);
      if (rec.locations.length === before) throw new Error(`Location '${locId}' not found`);
      await kv.put(keys.project(projectId), rec);
      changed({ kind: 'project', projectId });
      // i18n-ignore status payload returned by the storage layer, never shown
      return { message: 'deleted' };
    },

    async discoverLocations(projectId: string): Promise<{ discovered: number; locations: LocationEntry[] }> {
      const rec = await readProject(projectId);
      const existing = new Set<string>();
      for (const l of rec.locations) { existing.add(l.name); for (const a of l.aliases || []) existing.add(a); }
      const found = new Map<string, LocationEntry['type']>();
      for (const meta of await allScripts(projectId)) {
        const content = await contentOf(projectId, meta.id);
        for (const heading of sceneHeadings(content)) {
          const { name, type } = parseLocationFromHeading(heading);
          if (!name) continue;
          const canonical = normalizeLocationName(name);
          if (existing.has(canonical)) continue;
          const prev = found.get(canonical);
          found.set(canonical, prev && prev !== type ? 'both' : type);
        }
      }
      const ts = now();
      for (const [name, type] of found) rec.locations.push(blankLocation(name, type, ts));
      if (found.size) {
        await kv.put(keys.project(projectId), rec);
        changed({ kind: 'project', projectId });
      }
      return { discovered: found.size, locations: rec.locations };
    },

    // ── Formatting templates ──────────────────────────────────────────────

    async listFormattingTemplates(): Promise<any[]> {
      const list = (await kv.get<any[]>(keys.templates)) ?? [];
      return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },

    async createFormattingTemplate(template: any): Promise<any> {
      const list = (await kv.get<any[]>(keys.templates)) ?? [];
      list.push(template);
      await kv.put(keys.templates, list);
      changed({ kind: 'templates' });
      return template;
    },

    async updateFormattingTemplate(id: string, template: any): Promise<any> {
      const list = (await kv.get<any[]>(keys.templates)) ?? [];
      const i = list.findIndex((t) => t.id === id);
      if (i >= 0) list[i] = { ...list[i], ...template, id };
      await kv.put(keys.templates, list);
      changed({ kind: 'templates' });
      return list[i];
    },

    async deleteFormattingTemplate(id: string): Promise<any> {
      const list = ((await kv.get<any[]>(keys.templates)) ?? []).filter((t) => t.id !== id);
      await kv.put(keys.templates, list);
      changed({ kind: 'templates' });
      return { message: 'deleted' };
    },
  };

  return storage;
}

export type WebStorage = ReturnType<typeof createWebStorage>;
