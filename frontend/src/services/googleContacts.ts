/**
 * Email suggestions from Google (SwissCirkus fork, Christian 2026-11-16: "is there any way we can bring in email suggestions
 * from Gmail?"). Optional, like Google Docs access: one click in the Collaborate window asks Google for read-only access to
 * your contacts and to "other contacts" — the people Gmail suggests because you've emailed them — and the invite box then
 * suggests names and addresses as you type. The list is read straight from Google into this page and kept in memory only;
 * the permission token stays in this browser (as the Docs one does). Nothing is ever sent anywhere else.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Google's sign-in script (gsi/client) comes without types, as in driveSync.ts */
import { create } from 'zustand';
import { GOOGLE_CLIENT_ID } from './driveSync';

export const CONTACTS_SCOPES = [
  'https://www.googleapis.com/auth/contacts.other.readonly', // the people Gmail suggests (you've written to them)
  'https://www.googleapis.com/auth/contacts.readonly', // your saved Google contacts
];
const FLAG = 'screenplays:contactsAccess';
const TOKEN_KEY = 'screenplays:contactsToken';
const PEOPLE = 'https://people.googleapis.com/v1';

export interface Contact { name: string; email: string }

interface ContactsState { on: boolean; loading: boolean; contacts: Contact[]; message: string }
export const useContacts = create<ContactsState>(() => ({ on: readFlag(), loading: false, contacts: [], message: '' }));

function readFlag(): boolean {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

let token: string | null = null;
let expiry = 0;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
let gsiLoader: () => Promise<any> = loadGsi;

/** Tests: a fake network and a fake Google sign-in. */
export function _setContactsTestHooks(h: { fetch?: typeof fetch; gsi?: () => Promise<any>; token?: string | null }) {
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
  const scope = CONTACTS_SCOPES.join(' ');
  await new Promise<void>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      include_granted_scopes: true,
      callback: (res: any) => {
        if (res.error) { reject(new Error(res.error_description || res.error)); return; }
        const some = typeof g.accounts.oauth2.hasGrantedAnyScope === 'function' ? g.accounts.oauth2.hasGrantedAnyScope(res, ...CONTACTS_SCOPES) : true;
        if (!some) { reject(new Error('Access to your contacts was not ticked')); return; }
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

/** Ready to read now (a token that hasn't run out)? Otherwise a click on "Load suggestions" asks Google again. */
export const contactsTokenValid = () => !!token && Date.now() < expiry;

/* One People API list, every page (at most 2,000 people). */
async function listAll(url: string, key: 'otherContacts' | 'connections'): Promise<Contact[]> {
  const out: Contact[] = [];
  let page = '';
  for (let i = 0; i < 4; i++) {
    const r = await fetchImpl(url + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 403) return out; // that half wasn't granted — the other may still be
    if (!r.ok) throw new Error('Google contacts answered ' + r.status);
    const j = (await r.json()) as any;
    for (const p of (j[key] || []) as any[]) {
      const name = String(p.names?.[0]?.displayName || '').trim();
      for (const e of (p.emailAddresses || []) as any[]) {
        const email = String(e.value || '').trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ name, email });
      }
    }
    page = j.nextPageToken || '';
    if (!page) break;
  }
  return out;
}

/** Saved contacts and the people Gmail suggests, one entry per address (a saved name wins), sorted by name. */
export function mergeContacts(lists: Contact[][]): Contact[] {
  const by = new Map<string, Contact>();
  for (const list of lists) for (const c of list) {
    const k = c.email.toLowerCase();
    const had = by.get(k);
    if (!had || (!had.name && c.name)) by.set(k, { name: c.name, email: c.email });
  }
  return [...by.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

/** Read the suggestions (asking Google first when `ask` and there's no valid token). Turns the feature on. */
export async function loadContacts(ask = false): Promise<Contact[]> {
  useContacts.setState({ loading: true, message: '' });
  try {
    if (!contactsTokenValid()) {
      if (!ask) { useContacts.setState({ loading: false }); return useContacts.getState().contacts; }
      await askGoogle(useContacts.getState().on ? '' : 'consent');
    }
    try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
    const [other, saved] = await Promise.all([
      listAll(`${PEOPLE}/otherContacts?readMask=names,emailAddresses&pageSize=1000`, 'otherContacts'),
      listAll(`${PEOPLE}/people/me/connections?personFields=names,emailAddresses&pageSize=1000`, 'connections'),
    ]);
    const contacts = mergeContacts([saved, other]);
    useContacts.setState({ on: true, loading: false, contacts, message: '' });
    return contacts;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useContacts.setState({ loading: false, message });
    return useContacts.getState().contacts;
  }
}

/** Switch it off here (the list is forgotten; Google's permission can be removed in your Google account). */
export function forgetContacts(): void {
  token = null; expiry = 0;
  try { localStorage.removeItem(FLAG); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  useContacts.setState({ on: false, contacts: [], message: '' });
}

/** The suggestions for what's typed: name or address contains it; at most 8. */
export function suggest(contacts: Contact[], typed: string, max = 8): Contact[] {
  const q = typed.trim().toLowerCase();
  if (q.length < 1) return [];
  return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, max);
}

/** A Gmail window with the invite filled in (you press Send there). */
export function gmailInviteUrl(email: string, title: string, link: string): string {
  const su = `Join me on “${title}” in Screenplays`;
  const body = `Hi,\n\nhere's the link to write with me on “${title}”:\n${link}\n\nIt opens in your browser.`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;
}
