/**
 * Shared scripts (SwissCirkus, Christian 2026-11-16: "I'm not a big fan of … you both have to be online or you have to host it …
 * share it with somebody, then they can edit it whenever they want … I see the live updates … even if I close it … They can carry
 * on editing … a bit more like Google Docs").
 *
 * A shared script lives HERE, not in one person's browser: its live text is a Yjs document named `shared/<id>`, kept in the
 * database (shared_documents) so it survives restarts, and opened by anyone with access whenever they like — no host, no session
 * to end. Access is by the email of the person's account: the owner, plus every email it is shared with, each with a role
 * (editor / suggester / viewer). The owner alone shares, unshares, renames for everyone and deletes.
 *
 * Plain functions over the DB adapter, so routes/shared.ts, server.ts (the live connection) and the tests share one set of rules.
 */
import { v4 as uuidv4 } from 'uuid';
import type { DBAdapter } from '../database/adapter';

export type Role = 'owner' | 'editor' | 'suggester' | 'viewer';
export const SHARE_ROLES = ['editor', 'suggester', 'viewer'] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

const DOC_PREFIX = 'shared/';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,63}$/;

export const docNameOf = (id: string) => DOC_PREFIX + id;
export function scriptIdOfDoc(documentName: string): string | null {
  if (!documentName.startsWith(DOC_PREFIX)) return null;
  const id = documentName.slice(DOC_PREFIX.length);
  return ID_RE.test(id) ? id : null;
}
export const isSharedDoc = (documentName: string) => scriptIdOfDoc(documentName) !== null;
export const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
export const validEmail = (e: string) => EMAIL_RE.test(e);
export const validId = (id: string) => ID_RE.test(id);
const cleanTitle = (t: unknown) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || 'Untitled';
const nowIso = () => new Date().toISOString();

export interface Who { id: string; email: string }
export interface SharedScriptRow { id: string; owner_id: string; title: string; format: string; created_at: string; updated_at: string }

/** What this person may do with the script: 'owner', a share role, or null (no access / no such script). */
export async function accessOf(db: DBAdapter, scriptId: string, who: Who): Promise<Role | null> {
  if (!validId(scriptId)) return null;
  const s = await db.get<SharedScriptRow>('SELECT * FROM shared_scripts WHERE id = ?', [scriptId]);
  if (!s) return null;
  if (s.owner_id === who.id) return 'owner';
  const share = await db.get<{ role: string }>('SELECT role FROM script_shares WHERE script_id = ? AND email = ?', [scriptId, normEmail(who.email)]);
  return share && (SHARE_ROLES as readonly string[]).includes(share.role) ? (share.role as ShareRole) : null;
}

/** The role a live connection gets: the owner writes like an editor. */
export const liveRole = (r: Role): ShareRole => (r === 'owner' ? 'editor' : r);

export async function createScript(db: DBAdapter, who: Who, title: unknown, format: unknown): Promise<SharedScriptRow> {
  const row: SharedScriptRow = { id: uuidv4(), owner_id: who.id, title: cleanTitle(title), format: String(format || 'screenplay').slice(0, 40), created_at: nowIso(), updated_at: nowIso() };
  await db.run('INSERT INTO shared_scripts (id, owner_id, title, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [row.id, row.owner_id, row.title, row.format, row.created_at, row.updated_at]);
  return row;
}

/** Everything this person can open: their own (with who it's shared with) and what others shared with them. */
export async function listFor(db: DBAdapter, who: Who) {
  const owned = await db.all<SharedScriptRow>('SELECT * FROM shared_scripts WHERE owner_id = ? ORDER BY updated_at DESC', [who.id]);
  const shares = owned.length
    ? await db.all<{ script_id: string; email: string; role: string }>(`SELECT script_id, email, role FROM script_shares WHERE script_id IN (${owned.map(() => '?').join(',')}) ORDER BY email`, owned.map((s) => s.id))
    : [];
  const withMe = await db.all<SharedScriptRow & { role: string; owner_name: string; owner_email: string }>(
    `SELECT s.*, sh.role AS role, u.display_name AS owner_name, u.email AS owner_email
       FROM script_shares sh JOIN shared_scripts s ON s.id = sh.script_id JOIN users u ON u.id = s.owner_id
      WHERE sh.email = ? AND s.owner_id <> ? ORDER BY s.updated_at DESC`, [normEmail(who.email), who.id]);
  return {
    owned: owned.map((s) => ({ ...publicRow(s), role: 'owner' as Role, shares: shares.filter((x) => x.script_id === s.id).map((x) => ({ email: x.email, role: x.role })) })),
    sharedWithMe: withMe.map((s) => ({ ...publicRow(s), role: s.role as Role, owner: { name: s.owner_name, email: s.owner_email } })),
  };
}
const publicRow = (s: SharedScriptRow) => ({ id: s.id, title: s.title, format: s.format, createdAt: s.created_at, updatedAt: s.updated_at, documentName: docNameOf(s.id) });

export async function share(db: DBAdapter, scriptId: string, email: string, role: string): Promise<void> {
  await db.run('DELETE FROM script_shares WHERE script_id = ? AND email = ?', [scriptId, email]);
  await db.run('INSERT INTO script_shares (script_id, email, role, created_at) VALUES (?, ?, ?, ?)', [scriptId, email, role, nowIso()]);
}
export async function unshare(db: DBAdapter, scriptId: string, email: string): Promise<boolean> {
  return (await db.run('DELETE FROM script_shares WHERE script_id = ? AND email = ?', [scriptId, email])).changes > 0;
}
export async function rename(db: DBAdapter, scriptId: string, title: unknown): Promise<string> {
  const t = cleanTitle(title);
  await db.run('UPDATE shared_scripts SET title = ?, updated_at = ? WHERE id = ?', [t, nowIso(), scriptId]);
  return t;
}
export async function remove(db: DBAdapter, scriptId: string): Promise<void> {
  await db.run('DELETE FROM script_shares WHERE script_id = ?', [scriptId]);
  await db.run('DELETE FROM shared_documents WHERE name = ?', [docNameOf(scriptId)]);
  await db.run('DELETE FROM shared_scripts WHERE id = ?', [scriptId]);
}

/* ---- the live text, kept in the database ---- */
export async function loadState(db: DBAdapter, documentName: string): Promise<Uint8Array | null> {
  const r = await db.get<{ state: string }>('SELECT state FROM shared_documents WHERE name = ?', [documentName]);
  return r && r.state ? new Uint8Array(Buffer.from(r.state, 'base64')) : null;
}
export async function storeState(db: DBAdapter, documentName: string, state: Uint8Array): Promise<void> {
  const b64 = Buffer.from(state).toString('base64'), at = nowIso();
  const done = await db.run('UPDATE shared_documents SET state = ?, updated_at = ? WHERE name = ?', [b64, at, documentName]);
  if (!done.changes) await db.run('INSERT INTO shared_documents (name, state, updated_at) VALUES (?, ?, ?)', [documentName, b64, at]);
  const id = scriptIdOfDoc(documentName);
  if (id) await db.run('UPDATE shared_scripts SET updated_at = ? WHERE id = ?', [at, id]);
}
