/**
 * Shared scripts — the writer's side (SwissCirkus, Christian 2026-11-16: "share it with somebody, then they can edit it whenever they
 * want … I see the live updates … even if I close it … a bit more like Google Docs"). The co-writing server keeps a shared script
 * (collab-server/src/services/sharedScripts.ts); anyone it's shared with opens it live at /shared/<id>, whenever they like, with
 * their own sign-in — no host, no session.
 *
 * Here: the server calls (/api/shared), the link to a shared script, the live connection's sign-in (fresh on every reconnect —
 * a sign-in lasts 15 minutes), the content a newly shared script starts from, and which of this browser's scripts became which
 * shared script.
 */
import { collabServerHttp } from '../config';
import { ensureCollabAuthenticated } from './collabAuth';
import { useSettingsStore } from '../stores/settingsStore';
import { reviewAuthToken } from './reviewProtocol';

export type SharedRole = 'owner' | 'editor' | 'suggester' | 'viewer';
export type ShareRole = 'editor' | 'suggester' | 'viewer';
export interface SharePerson { email: string; role: ShareRole }
export interface SharedScript {
  id: string; title: string; format: string; createdAt: string; updatedAt: string; documentName: string; role: SharedRole;
  shares?: SharePerson[]; owner?: { name: string; email: string };
}

export const sharedAvailable = () => !!collabServerHttp();

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests: a fake network. */
export function _setSharedTestFetch(f: typeof fetch) { fetchImpl = f; }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const st = await ensureCollabAuthenticated();
  if (st === 'signed-out') throw new Error('Sign in (Sign in to co-write, top right) to share scripts'); // i18n-ignore: SwissCirkus
  const token = useSettingsStore.getState().collabAuth.accessToken;
  const r = await fetchImpl(`${collabServerHttp()}/api/shared${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error || `The co-writing server answered ${r.status}`); // i18n-ignore: SwissCirkus
  return j as T;
}

export const listShared = () => call<{ owned: SharedScript[]; sharedWithMe: SharedScript[] }>('GET', '');
export const createShared = (title: string, format: string) => call<SharedScript>('POST', '', { title, format });
export const getShared = (id: string) => call<SharedScript>('GET', `/${encodeURIComponent(id)}`);
export const shareWith = (id: string, email: string, role: ShareRole) => call<SharePerson>('POST', `/${encodeURIComponent(id)}/shares`, { email, role });
export const unshareWith = (id: string, email: string) => call<{ removed: boolean }>('DELETE', `/${encodeURIComponent(id)}/shares/${encodeURIComponent(email)}`);
export const renameShared = (id: string, title: string) => call<{ title: string }>('PATCH', `/${encodeURIComponent(id)}`, { title });
export const deleteShared = (id: string) => call<{ ok: boolean }>('DELETE', `/${encodeURIComponent(id)}`);

/** The address anyone it's shared with opens it at (the writer's own /shared/<id> page). */
export function sharedLink(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/shared/${id}`;
}
export const sharedDocName = (id: string) => `shared/${id}`;
export const isSharedDocName = (name: string) => /^shared\/[0-9a-f-]{36}$/.test(name);

/** The live connection's token, asked for on every (re)connect so it is never an expired sign-in. */
export async function sharedLiveToken(): Promise<string> {
  await ensureCollabAuthenticated();
  const token = useSettingsStore.getState().collabAuth.accessToken || '';
  return reviewAuthToken(`jwt:${token}|shared:1`);
}
/** What a suggester's suggestions are signed with in a shared script — the server works it out from the same text. */
export const sharedSuggesterKey = () => `user:${useSettingsStore.getState().collabAuth.user?.id || ''}`;

/* The content a newly shared script starts from: handed from the Share window to the /shared/<id> page in this tab. */
const seeds = new Map<string, Record<string, unknown>>();
export function setSharedSeed(id: string, doc: Record<string, unknown>) { seeds.set(id, doc); }
export function takeSharedSeed(id: string): Record<string, unknown> | null { const d = seeds.get(id) || null; seeds.delete(id); return d; }

/* Which script in this browser became which shared script (so sharing it again reuses it, and it can open the shared one). */
const MAP_KEY = 'screenplays:sharedMap';
function readMap(): Record<string, string> { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { return {}; } }
export function rememberShared(localScriptId: string, sharedId: string) { const m = readMap(); m[localScriptId] = sharedId; try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* ignore */ } }
export function sharedIdFor(localScriptId: string | null | undefined): string | null { return localScriptId ? readMap()[localScriptId] || null : null; }
export function localScriptFor(sharedId: string): string | null { const m = readMap(); return Object.keys(m).find((k) => m[k] === sharedId) || null; }
