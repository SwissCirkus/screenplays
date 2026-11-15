/**
 * Google Docs access for the Script Assistant (SwissCirkus fork, Christian 2026-11-15: "give the script assistant access to
 * my Google Docs … find things in there and read and write the files … all my Google Docs actually").
 *
 * An extra, optional step on top of the Drive mirror: the mirror only ever sees the files it made (drive.file); this asks
 * Google once for the writer's whole Drive, so the assistant can search, read and edit any Google Doc. The token stays in
 * this browser only. Reading happens on its own; every change to a Doc is shown first and made only on Apply (the panel).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Google's sign-in script (gsi/client) comes without types, as in driveSync.ts */
import { create } from 'zustand';
import { GOOGLE_CLIENT_ID } from './driveSync';

export const DOCS_SCOPE = 'https://www.googleapis.com/auth/drive';
const FLAG = 'screenplays:docsAccess';
const TOKEN_KEY = 'screenplays:docsToken';
const DOC_MIME = 'application/vnd.google-apps.document';
/** The longest Doc text handed to the assistant at once. */
export const MAX_DOC_CHARS = 120_000;

export interface DocHit { id: string; name: string; modified: string; url: string }

interface DocsAccessState { on: boolean; message: string }
export const useDocsAccess = create<DocsAccessState>(() => ({ on: readFlag(), message: '' }));

function readFlag(): boolean {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

let token: string | null = null;
let expiry = 0;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
let gsiLoader: () => Promise<any> = loadGsi;

/** Tests: a fake network and a fake Google sign-in. */
export function _setDocsTestHooks(h: { fetch?: typeof fetch; gsi?: () => Promise<any>; token?: string | null }) {
  if (h.fetch) fetchImpl = h.fetch;
  if (h.gsi) gsiLoader = h.gsi;
  if (h.token !== undefined) { token = h.token; expiry = h.token ? Date.now() + 3_600_000 : 0; }
}

try {
  const kept = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as { t: string; e: number } | null;
  if (kept && kept.t && kept.e > Date.now()) { token = kept.t; expiry = kept.e; }
} catch { /* nothing kept */ }

function loadGsi(): Promise<any> {
  const w = window as any;
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as any).google);
    s.onerror = () => reject(new Error('Google sign-in could not load'));
    document.head.appendChild(s);
  });
}

async function askGoogle(prompt: '' | 'consent'): Promise<void> {
  const g = await gsiLoader();
  await new Promise<void>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DOCS_SCOPE,
      include_granted_scopes: true,
      callback: (res: any) => {
        if (res.error) { reject(new Error(res.error_description || res.error)); return; }
        const granted = typeof g.accounts.oauth2.hasGrantedAllScopes === 'function' ? g.accounts.oauth2.hasGrantedAllScopes(res, DOCS_SCOPE) : true;
        if (!granted) { reject(new Error('Access to your Google Drive files was not ticked')); return; }
        token = res.access_token;
        expiry = Date.now() + (Number(res.expires_in || 3600) - 60) * 1000;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: token, e: expiry })); } catch { /* ignore */ }
        resolve();
      },
      error_callback: (err: any) => reject(new Error(err?.message || 'The Google window was closed')),
    });
    client.requestAccessToken({ prompt });
  });
}

/** The setup button (must run from a click: Google opens its window). */
export async function setUpDocsAccess(): Promise<boolean> {
  try {
    await askGoogle('consent');
    try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
    useDocsAccess.setState({ on: true, message: '' });
    return true;
  } catch (e) {
    useDocsAccess.setState({ message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Turn it off: forget the token here (Google's own permission can be removed at myaccount.google.com/permissions). */
export function turnOffDocsAccess(): void {
  token = null; expiry = 0;
  try { localStorage.removeItem(FLAG); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  useDocsAccess.setState({ on: false, message: '' });
}

export function docsAccessOn(): boolean { return useDocsAccess.getState().on; }

async function currentToken(): Promise<string> {
  if (token && Date.now() < expiry) return token;
  await askGoogle(''); // Google renews quietly when it can; otherwise this needs the setup button again
  return token!;
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await currentToken();
  const r = await fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${t}` } });
  if (r.status === 401) { token = null; expiry = 0; }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error?.message || ''; } catch { /* not JSON */ }
    throw new Error(detail || `Google answered ${r.status}`);
  }
  return r;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Google Docs whose name or text matches `query` (empty: the most recently changed). */
export async function searchDocs(query: string, max = 10): Promise<DocHit[]> {
  const words = query.trim();
  const filter = [`mimeType='${DOC_MIME}'`, 'trashed=false'];
  if (words) filter.push(`(name contains '${q(words)}' or fullText contains '${q(words)}')`);
  const params = new URLSearchParams({
    q: filter.join(' and '),
    pageSize: String(Math.max(1, Math.min(25, max))),
    fields: 'files(id,name,modifiedTime,webViewLink)',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  if (!words) params.set('orderBy', 'modifiedTime desc'); // Drive can't sort a full-text search; it ranks by relevance
  const r = await call(`https://www.googleapis.com/drive/v3/files?${params}`);
  const j = (await r.json()) as { files?: { id: string; name: string; modifiedTime?: string; webViewLink?: string }[] };
  return (j.files ?? []).map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime ?? '', url: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` }));
}

/** A Google Doc's id from its id or link. */
export function docIdOf(idOrUrl: string): string {
  const m = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(idOrUrl);
  return m ? m[1] : idOrUrl.trim();
}

/** A Doc's name and plain text. */
export async function readDoc(idOrUrl: string): Promise<{ id: string; name: string; text: string; cut: boolean }> {
  const id = docIdOf(idOrUrl);
  const meta = (await (await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType&supportsAllDrives=true`)).json()) as { name: string; mimeType: string };
  if (meta.mimeType !== DOC_MIME) throw new Error(`"${meta.name}" is not a Google Doc`);
  const text = await (await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text/plain`)).text();
  const clean = text.replace(/^\uFEFF/, '');
  return { id, name: meta.name, text: clean.slice(0, MAX_DOC_CHARS), cut: clean.length > MAX_DOC_CHARS };
}

/** A new Google Doc with this text; returns where it is. */
export async function createDoc(title: string, text: string): Promise<DocHit> {
  const boundary = 'sp' + Math.random().toString(36).slice(2);
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name: title || 'Untitled', mimeType: DOC_MIME }),
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', text, `--${boundary}--`, '',
  ].join('\r\n');
  const r = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  const f = (await r.json()) as { id: string; name: string; modifiedTime?: string; webViewLink?: string };
  return { id: f.id, name: f.name, modified: f.modifiedTime ?? '', url: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` };
}

/** Add text to the end of a Doc. */
export async function appendToDoc(idOrUrl: string, text: string): Promise<void> {
  const id = docIdOf(idOrUrl);
  await call(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}:batchUpdate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertText: { endOfSegmentLocation: {}, text: (text.startsWith('\n') ? '' : '\n') + text } }] }),
  });
}

/** Replace all of a Doc's text (its formatting goes with it). */
export async function replaceDocText(idOrUrl: string, text: string): Promise<void> {
  const id = docIdOf(idOrUrl);
  const doc = (await (await call(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}?fields=body(content(endIndex))`)).json()) as { body?: { content?: { endIndex?: number }[] } };
  const end = Math.max(1, ...(doc.body?.content ?? []).map((c) => c.endIndex ?? 1));
  const requests: unknown[] = [];
  if (end - 1 > 1) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } });
  requests.push({ insertText: { location: { index: 1 }, text } });
  await call(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}:batchUpdate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
}

/** A Doc as a web page (Google's own export), for the readable copy in the Doc view. Scripts and frames are removed. */
export async function readDocHtml(idOrUrl: string): Promise<string> {
  const id = docIdOf(idOrUrl);
  const html = await (await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text/html`)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, link[rel="import"]').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });
  const base = doc.createElement('base');
  base.setAttribute('target', '_blank');
  doc.head.prepend(base);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
