import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeContacts, suggest, gmailInviteUrl, loadContacts, useContacts, _setContactsTestHooks, forgetContacts, CONTACTS_SCOPES } from './googleContacts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// SwissCirkus (Christian 2026-11-16): email suggestions from Gmail in the Collaborate window; invites last 7 days, Co-Edit.
describe('Gmail suggestions for invites', () => {
  beforeEach(() => { forgetContacts(); });

  it('asks only for read-only contacts', () => {
    expect(CONTACTS_SCOPES).toEqual(['https://www.googleapis.com/auth/contacts.other.readonly', 'https://www.googleapis.com/auth/contacts.readonly']);
  });

  it('one entry per address, a saved name wins, sorted; suggestions match name or address', () => {
    const all = mergeContacts([[{ name: 'Marshall', email: 'M@x.nz' }], [{ name: '', email: 'm@x.nz' }, { name: 'Ann', email: 'ann@y.com' }]]);
    expect(all).toEqual([{ name: 'Ann', email: 'ann@y.com' }, { name: 'Marshall', email: 'M@x.nz' }]);
    expect(suggest(all, 'mar').map((c) => c.email)).toEqual(['M@x.nz']);
    expect(suggest(all, 'y.com').map((c) => c.name)).toEqual(['Ann']);
    expect(suggest(all, '')).toEqual([]);
  });

  it('reads both lists from Google (people Gmail suggests + saved contacts), with the token, nothing else', async () => {
    const seen: string[] = [];
    _setContactsTestHooks({
      token: 'tok',
      fetch: (async (url: string, init: { headers: Record<string, string> }) => {
        seen.push(url); expect(init.headers.Authorization).toBe('Bearer tok');
        const body = url.includes('otherContacts')
          ? { otherContacts: [{ emailAddresses: [{ value: 'friend@mail.com' }] }, { emailAddresses: [{ value: 'not-an-email' }] }] }
          : { connections: [{ names: [{ displayName: 'Friend' }], emailAddresses: [{ value: 'friend@mail.com' }] }] };
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const list = await loadContacts(false);
    expect(list).toEqual([{ name: 'Friend', email: 'friend@mail.com' }]);
    expect(useContacts.getState().on).toBe(true);
    expect(seen.every((u) => u.startsWith('https://people.googleapis.com/v1/'))).toBe(true);
  });

  it('the Gmail message is only filled in — you press Send', () => {
    const u = gmailInviteUrl('a@b.com', 'My Film', 'https://collab.example/collab/T1');
    expect(u.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com')).toBe(true);
    expect(decodeURIComponent(u)).toContain('https://collab.example/collab/T1');
  });

  it('invite links default to 7 days and Co-Edit; the window suggests, keeps the address and offers Email', () => {
    expect(src('../stores/settingsStore.ts')).toMatch(/localStorage\.getItem\(STORAGE_KEY_EXPIRY\) \|\| '168'/);
    const d = src('../components/ShareDialog.tsx');
    expect(d).toMatch(/useState<'editor' \| 'suggester' \| 'viewer'>\('editor'\)/);
    expect(d).toMatch(/defaultInviteExpiry \|\| 168/);
    expect(d).toMatch(/suggest\(contacts, name\)/);
    expect(d).toMatch(/if \(email\) setEmails\(\(prev\) => \(\{ \.\.\.prev, \[session\.token\]: email \}\)\);/);
    expect(d).toMatch(/window\.open\(gmailInviteUrl\(emails\[token\], scriptTitle, linkFor\(token\)\), '_blank', 'noopener'\)/);
  });

  it('Collaborate is a button in the menu bar too (not for a guest)', () => {
    const m = src('../components/MenuBar.tsx');
    expect(m).toMatch(/\{onCollaborate && !isCollabGuest && \(\s*<button\s*type="button"\s*className=\{`menu-assistant-btn menu-collab-btn/);
    expect(m).toMatch(/onClick=\{\(\) => \{ setActiveMenu\(null\); onCollaborate\(\); \}\}/);
  });
});
