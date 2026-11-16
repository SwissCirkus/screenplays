import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCS_OFF_PROMPT, DOCS_ON_PROMPT, isLookup, isWrite, lookupResult, matchProject, parseDocActions, projectsForModel } from './docTools';
import {
  _setDocsTestHooks, appendToDoc, createDoc, docIdOf, readDoc, replaceDocText, searchDocs, setUpDocsAccess, turnOffDocsAccess, useDocsAccess,
} from '../../services/googleDocsAccess';

// Google Docs access for the Script Assistant (Christian 2026-11-15).
interface Seen { url: string; method: string; body: string; auth: string }
function fakeGoogle(respond: (s: Seen) => Response) {
  const seen: Seen[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const s = { url: String(input), method: init?.method ?? 'GET', body: String(init?.body ?? ''), auth: h.get('Authorization') ?? '' };
    seen.push(s);
    return respond(s);
  }) as typeof fetch;
  return { f, seen };
}
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });

beforeEach(() => { localStorage.clear(); _setDocsTestHooks({ token: 'tok' }); });

describe('the assistant asks for Docs in its JSON', () => {
  it('reads searches, reads and changes, and drops bad entries', () => {
    const r = parseDocActions('```json\n{"reply":"x","edits":[],"docs":[{"do":"search","query":"notes"},{"do":"read","id":"abc"},{"do":"read"},{"do":"create","title":"T","text":"hi"},{"do":"append","id":"d1","name":"N","text":"more"},{"do":"replace","id":"d1"},{"do":"nonsense"}]}\n```');
    expect(r.actions).toEqual([
      { do: 'search', query: 'notes' }, { do: 'read', id: 'abc' }, { do: 'create', title: 'T', text: 'hi' },
      { do: 'append', id: 'd1', name: 'N', text: 'more' },
    ]);
    expect(r.actions.filter(isLookup)).toHaveLength(2);
    expect(r.actions.filter(isWrite)).toHaveLength(2);
    expect(parseDocActions('{"reply":"Set it up first","setup":true}').setup).toBe(true);
    expect(parseDocActions('just prose')).toEqual({ actions: [], setup: false });
  });

  it('is told what it can do, or to talk the writer through the setup', () => {
    expect(DOCS_ON_PROMPT).toMatch(/"do":"search"/);
    expect(DOCS_ON_PROMPT).toMatch(/shown to the\s+writer, who applies them/);
    expect(DOCS_OFF_PROMPT).toMatch(/Set up Google Docs access/);
    expect(DOCS_OFF_PROMPT).toMatch(/"setup": true/);
  });

  it('gets what it found back in plain words', () => {
    expect(lookupResult({ do: 'search', query: 'x' }, { hits: [] })).toMatch(/no Google Docs found/);
    expect(lookupResult({ do: 'search', query: 'x' }, { hits: [{ id: 'a', name: 'Notes', modified: '2026-11-01T10:00:00Z' }] })).toContain('id a · "Notes" · changed 2026-11-01');
    expect(lookupResult({ do: 'read', id: 'a' }, { doc: { id: 'a', name: 'Notes', text: 'Hello', cut: true } })).toMatch(/READ "Notes" \(id a\) — only the first part/);
    expect(lookupResult({ do: 'read', id: 'a' }, { error: 'gone' })).toBe('READ a: failed (gone)');
  });
});

describe('Google Docs calls', () => {
  it('searches all Docs by name or text, with the writer\'s token', async () => {
    const { f, seen } = fakeGoogle(() => json({ files: [{ id: 'd1', name: "Ann's notes", modifiedTime: '2026-11-02T00:00:00Z' }] }));
    _setDocsTestHooks({ fetch: f });
    const hits = await searchDocs("Ann's");
    expect(hits).toEqual([{ id: 'd1', name: "Ann's notes", modified: '2026-11-02T00:00:00Z', url: 'https://docs.google.com/document/d/d1/edit' }]);
    const u = new URL(seen[0].url);
    expect(u.searchParams.get('q')).toBe("mimeType='application/vnd.google-apps.document' and trashed=false and (name contains 'Ann\\'s' or fullText contains 'Ann\\'s')");
    expect(u.searchParams.get('orderBy')).toBeNull();
    expect(seen[0].auth).toBe('Bearer tok');
    await searchDocs('');
    expect(new URL(seen[1].url).searchParams.get('orderBy')).toBe('modifiedTime desc');
  });

  it('reads a Doc as plain text, from its id or link, and refuses other files', async () => {
    expect(docIdOf('https://docs.google.com/document/d/AbC_1-x/edit#heading')).toBe('AbC_1-x');
    const { f, seen } = fakeGoogle((s) => s.url.includes('/export')
      ? new Response('﻿Scene notes')
      : json({ name: 'Notes', mimeType: s.url.includes('sheet') ? 'application/vnd.google-apps.spreadsheet' : 'application/vnd.google-apps.document' }));
    _setDocsTestHooks({ fetch: f });
    expect(await readDoc('https://docs.google.com/document/d/D9/edit')).toEqual({ id: 'D9', name: 'Notes', text: 'Scene notes', cut: false });
    expect(seen[1].url).toContain('/files/D9/export?mimeType=text/plain');
    await expect(readDoc('sheet1')).rejects.toThrow(/not a Google Doc/);
  });

  it('makes, adds to and replaces Docs', async () => {
    const { f, seen } = fakeGoogle((s) => s.url.includes('upload') ? json({ id: 'n1', name: 'New' })
      : s.method === 'GET' ? json({ body: { content: [{ endIndex: 1 }, { endIndex: 40 }] } }) : json({}));
    _setDocsTestHooks({ fetch: f });
    expect(await createDoc('New', 'Line one')).toMatchObject({ id: 'n1', url: 'https://docs.google.com/document/d/n1/edit' });
    expect(seen[0].body).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(seen[0].body).toContain('Line one');
    await appendToDoc('d1', 'More');
    expect(JSON.parse(seen[1].body)).toEqual({ requests: [{ insertText: { endOfSegmentLocation: {}, text: '\nMore' } }] });
    await replaceDocText('d1', 'All new');
    expect(JSON.parse(seen[3].body).requests).toEqual([
      { deleteContentRange: { range: { startIndex: 1, endIndex: 39 } } },
      { insertText: { location: { index: 1 }, text: 'All new' } },
    ]);
  });

  it('a Google error becomes a plain message', async () => {
    _setDocsTestHooks({ fetch: (async () => new Response(JSON.stringify({ error: { message: 'File not found: x' } }), { status: 404 })) as typeof fetch });
    await expect(readDoc('x')).rejects.toThrow('File not found: x');
  });

  it('setup asks Google for the whole Drive once — on its own sign-in, not the main one — and can be turned off', async () => {
    vi.stubEnv('VITE_GOOGLE_DOCS_CLIENT_ID', '');
    expect(await setUpDocsAccess()).toBe(false); // not set up on this site: says so, asks Google nothing
    expect(useDocsAccess.getState().message).toMatch(/isn't set up on this site yet/);
    vi.stubEnv('VITE_GOOGLE_DOCS_CLIENT_ID', 'docs-client.apps.googleusercontent.com');
    let asked = '';
    let client = '';
    _setDocsTestHooks({
      token: null,
      gsi: async () => ({ accounts: { oauth2: {
        hasGrantedAllScopes: () => true,
        initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: unknown) => void }) => ({
          requestAccessToken: () => { asked = cfg.scope; client = cfg.client_id; cfg.callback({ access_token: 'new', expires_in: 3600 }); },
        }),
      } } }),
    });
    expect(await setUpDocsAccess()).toBe(true);
    expect(asked).toBe('https://www.googleapis.com/auth/drive');
    expect(client).toBe('docs-client.apps.googleusercontent.com');
    vi.unstubAllEnvs();
    expect(useDocsAccess.getState().on).toBe(true);
    expect(localStorage.getItem('screenplays:docsAccess')).toBe('1');
    turnOffDocsAccess();
    expect(useDocsAccess.getState().on).toBe(false);
    expect(localStorage.getItem('screenplays:docsToken')).toBeNull();
  });

  it('the panel only changes a Doc from Apply, and shows the setup button when it isn\'t set up', () => {
    const panel = readFileSync(new URL('./ScriptAssistantPanel.tsx', import.meta.url), 'utf8');
    expect(panel).toMatch(/const writes = docsHere \? docActs\.actions\.filter\(isWrite\) : \[\];/);
    expect(panel).toMatch(/const applyDocs = async \(\) => \{/);
    expect(panel).toMatch(/onClick=\{\(\) => void applyDocs\(\)\}/);
    expect(panel).toMatch(/\{m\.setup && !docsOn && \(/);
    expect(panel).toMatch(/if \(!lookups\.length \|\| !docsHere \|\| round >= MAX_DOC_ROUNDS\) break;/);
  });
});

describe('attaching Docs to projects (Christian 2026-11-15)', () => {
  it('reads a link action, and drops one without a project', () => {
    const r = parseDocActions('{"reply":"","docs":[{"do":"link","id":"d1","name":"Notes","project":"Goldpaw"},{"do":"link","id":"d2"}]}');
    expect(r.actions).toEqual([{ do: 'link', id: 'd1', name: 'Notes', project: 'Goldpaw' }]);
    expect(isWrite(r.actions[0])).toBe(true);
    expect(DOCS_ON_PROMPT).toMatch(/"do":"link"/);
    expect(DOCS_ON_PROMPT).toMatch(/misheard by dictation/);
  });

  it('finds the project it named, even with different case or punctuation', () => {
    const ps = [{ id: '1', name: 'Chronicle Of Inevitable Days' }, { id: '2', name: 'Out Of Order' }, { id: '3', name: 'M For Maps' }];
    expect(matchProject(ps, 'Chronicle Of Inevitable Days')?.id).toBe('1');
    expect(matchProject(ps, 'out of order')?.id).toBe('2');
    expect(matchProject(ps, 'M-for-Maps')?.id).toBe('3');
    expect(matchProject(ps, 'Chronicle')?.id).toBe('1');
    expect(matchProject(ps, 'Protocol')).toBeNull();
    expect(projectsForModel(['A', 'B'])).toBe('THE WRITER\'S PROJECTS: "A", "B"');
  });

  it('the panel tells the model the projects and attaches through the project links', () => {
    const panel = readFileSync(new URL('./ScriptAssistantPanel.tsx', import.meta.url), 'utf8');
    expect(panel).toMatch(/projectNames = \(await api\.listProjects\(\)\)\.map\(\(p\) => p\.name\)/);
    expect(panel).toMatch(/await addProjectLink\(project\.id, `https:\/\/docs\.google\.com\/document\/d\/\$\{docIdOf\(w\.id\)\}\/edit`/);
    expect(readFileSync(new URL('../../components/NavigatorProjects.tsx', import.meta.url), 'utf8')).toMatch(/addEventListener\('screenplays:library-changed', onChanged\)/);
  });
});
