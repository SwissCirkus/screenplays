/**
 * Stay connected to Google Drive (SwissCirkus, Christian 2026-11-16: "I shouldn't have to click connect to Google Drive …
 * Once I'm connected, it just stays connected").
 *
 * Google gives a browser page a Drive pass that lasts an hour, and renewing it quietly needs a pop-up the browser blocks — so the
 * writer kept asking to connect again. Instead: you connect once, the writer hands this server Google's one-time code, and the
 * server swaps it for a long-lasting pass (a refresh token), kept here encrypted (AES-256-GCM, key DRIVE_TOKEN_KEY). From then on
 * the writer asks for a fresh one-hour pass whenever it needs one. Google ends the long pass if you remove the app at
 * myaccount.google.com/permissions; the writer then asks you to connect once more.
 *
 * The Google calls are passed in (GoogleDrivePass), so the tests run without Google.
 */
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { DBAdapter } from '../database/adapter';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleDrivePass {
  /** Google's one-time code → the long pass and the permissions it covers. */
  exchange(code: string): Promise<{ refresh_token?: string | null; scope?: string | null; access_token?: string | null; expires_in?: number; id_token?: string | null }>;
  /** Who Google says signed in (the id token that came with the code). */
  identify(idToken: string): Promise<{ sub: string; email: string; name?: string } | null>;
  /** The long pass → a fresh one-hour pass. Throws { invalidGrant: true } when Google has ended the long pass. */
  refresh(refreshToken: string): Promise<{ access_token: string; expires_in: number }>;
  revoke(refreshToken: string): Promise<void>;
}

export class DriveReconnect extends Error { constructor() { super('Google Drive needs connecting again'); } }

function key(): Buffer | null {
  const k = process.env.DRIVE_TOKEN_KEY || '';
  if (!k) return null;
  return /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : crypto.createHash('sha256').update(k).digest();
}

/** Can this server keep Drive passes? (Needs the Google client secret and DRIVE_TOKEN_KEY.) */
export function available(): boolean {
  return !!key() && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.GOOGLE_CLIENT_ID;
}

export function seal(plain: string): string {
  const k = key(); if (!k) throw new Error('DRIVE_TOKEN_KEY is not set');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}
export function open(sealed: string): string {
  const k = key(); if (!k) throw new Error('DRIVE_TOKEN_KEY is not set');
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1') throw new Error('Unknown token format');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

/** Google, for real: the writer's sign-in client, with its secret; 'postmessage' is what a pop-up code is issued to. */
export function realGoogle(): GoogleDrivePass {
  const client = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'postmessage');
  return {
    async exchange(code) {
      const { tokens } = await client().getToken(code);
      return { refresh_token: tokens.refresh_token, scope: tokens.scope, access_token: tokens.access_token, id_token: tokens.id_token, expires_in: tokens.expiry_date ? Math.round((tokens.expiry_date - Date.now()) / 1000) : 3600 };
    },
    async identify(idToken) {
      const ticket = await client().verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      return p && p.sub && p.email && p.email_verified !== false ? { sub: p.sub, email: p.email, name: p.name } : null;
    },
    async refresh(refreshToken) {
      const c = client();
      c.setCredentials({ refresh_token: refreshToken });
      try {
        const { token } = await c.getAccessToken();
        if (!token) throw new Error('Google gave no Drive pass');
        const exp = c.credentials.expiry_date;
        return { access_token: token, expires_in: exp ? Math.round((exp - Date.now()) / 1000) : 3600 };
      } catch (err: any) {
        const e = err?.response?.data?.error || err?.message || '';
        if (String(e).includes('invalid_grant')) throw Object.assign(new Error('invalid_grant'), { invalidGrant: true });
        throw err;
      }
    },
    async revoke(refreshToken) { try { await client().revokeToken(refreshToken); } catch { /* already gone */ } },
  };
}

const nowIso = () => new Date().toISOString();

/**
 * Connect: swap Google's code for the long pass and keep it. When Google sends no long pass (you'd connected before and Google
 * remembers), `needsConsent` — the writer asks once more with Google's consent screen, which always sends one.
 */
export async function connect(db: DBAdapter, g: GoogleDrivePass, userId: string, code: string):
  Promise<{ ok: true; access_token?: string; expires_in?: number; scope?: string } | { ok: false; needsConsent?: boolean; error: string }> {
  if (!code || typeof code !== 'string' || code.length > 2048) return { ok: false, error: 'No Google code' };
  return keep(db, userId, await g.exchange(code));
}

/** Keep what Google's code was swapped for (Connect, or the one-step Google sign-in in routes/auth.ts). */
export async function keep(db: DBAdapter, userId: string, t: { refresh_token?: string | null; scope?: string | null; access_token?: string | null; expires_in?: number }):
  Promise<{ ok: true; access_token?: string; expires_in?: number; scope?: string } | { ok: false; needsConsent?: boolean; error: string }> {
  if (!String(t.scope || '').split(/\s+/).includes(DRIVE_FILE_SCOPE)) return { ok: false, error: 'Access to the Drive files the writer makes was not ticked' };
  if (!t.refresh_token) {
    // Google sends the lasting pass only the first time; if we still have one, that's fine
    if (await isConnected(db, userId)) return { ok: true, access_token: t.access_token || undefined, expires_in: t.expires_in, scope: t.scope || '' };
    return { ok: false, needsConsent: true, error: 'Google sent no lasting pass' };
  }
  const sealed = seal(t.refresh_token);
  const had = await db.get<{ user_id: string }>('SELECT user_id FROM drive_tokens WHERE user_id = ?', [userId]);
  if (had) await db.run('UPDATE drive_tokens SET refresh_enc = ?, scope = ?, updated_at = ? WHERE user_id = ?', [sealed, t.scope || '', nowIso(), userId]);
  else await db.run('INSERT INTO drive_tokens (user_id, refresh_enc, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [userId, sealed, t.scope || '', nowIso(), nowIso()]);
  return { ok: true, access_token: t.access_token || undefined, expires_in: t.expires_in, scope: t.scope || '' };
}

export async function isConnected(db: DBAdapter, userId: string): Promise<boolean> {
  return !!(await db.get('SELECT user_id FROM drive_tokens WHERE user_id = ?', [userId]));
}

/** A fresh one-hour Drive pass. DriveReconnect when there's none kept, or Google ended it (then it's forgotten here too). */
export async function freshPass(db: DBAdapter, g: GoogleDrivePass, userId: string): Promise<{ access_token: string; expires_in: number; scope: string }> {
  const row = await db.get<{ refresh_enc: string; scope: string }>('SELECT refresh_enc, scope FROM drive_tokens WHERE user_id = ?', [userId]);
  if (!row) throw new DriveReconnect();
  let rt: string;
  try { rt = open(row.refresh_enc); } catch { await db.run('DELETE FROM drive_tokens WHERE user_id = ?', [userId]); throw new DriveReconnect(); }
  // scope: what the pass covers (Drive, and Gmail suggestions once allowed — the writer's Share window reads them with it)
  try { return { ...(await g.refresh(rt)), scope: row.scope || '' }; }
  catch (err: any) {
    if (err?.invalidGrant) { await db.run('DELETE FROM drive_tokens WHERE user_id = ?', [userId]); throw new DriveReconnect(); }
    throw err;
  }
}

/** Disconnect: Google forgets the pass, and so does this server. */
export async function disconnect(db: DBAdapter, g: GoogleDrivePass, userId: string): Promise<void> {
  const row = await db.get<{ refresh_enc: string }>('SELECT refresh_enc FROM drive_tokens WHERE user_id = ?', [userId]);
  if (row) { try { await g.revoke(open(row.refresh_enc)); } catch { /* ignore */ } }
  await db.run('DELETE FROM drive_tokens WHERE user_id = ?', [userId]);
}
