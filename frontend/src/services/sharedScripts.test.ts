import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Christian 2026-11-16: share a script by email; anyone with it opens it whenever they like — no host, no session (phase 2, part 1).
describe('shared scripts — the writer side', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app'); localStorage.clear(); });

  it('calls the server with the person\'s sign-in, and says why when it refuses', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const future = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }));
    useSettingsStore.setState({ collabAuth: { accessToken: `h.${future}.s`, refreshToken: 'r', user: { id: 'u1', email: 'me@example.com', displayName: 'Me', emailVerified: true } } });
    const S = await import('./sharedScripts');
    const seen: { url: string; init: RequestInit }[] = [];
    S._setSharedTestFetch((async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      if (String(url).endsWith('/shares')) return new Response(JSON.stringify({ error: "That isn't an email address" }), { status: 400 });
      return new Response(JSON.stringify({ id: 'abc', title: 'T', role: 'owner' }), { status: 201 });
    }) as unknown as typeof fetch);
    expect(await S.createShared('T', 'screenplay')).toMatchObject({ id: 'abc' });
    expect(seen[0].url).toBe('https://cowrite.example.run.app/api/shared');
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe(`Bearer h.${future}.s`);
    await expect(S.shareWith('abc', 'nope', 'editor')).rejects.toThrow("That isn't an email address");
    expect(seen[1].url).toBe('https://cowrite.example.run.app/api/shared/abc/shares');
    // the live connection's sign-in: fresh each time, as the server reads it
    expect(await S.sharedLiveToken()).toBe(`jwt:h.${future}.s|shared:1|review:1`);
    expect(S.sharedSuggesterKey()).toBe('user:u1');
    useSettingsStore.setState({ collabAuth: { accessToken: null, refreshToken: null, user: null } });
    await expect(S.listShared()).rejects.toThrow(/Sign in/);
  });

  it('the link, the document name, the starting content and which script became which', async () => {
    const S = await import('./sharedScripts');
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(S.sharedLink(id)).toBe(`${window.location.origin}/shared/${id}`);
    expect(S.sharedDocName(id)).toBe('shared/' + id);
    expect(S.isSharedDocName('shared/' + id)).toBe(true);
    expect(S.isSharedDocName('proj/script/nonce')).toBe(false);
    S.setSharedSeed(id, { type: 'doc' });
    expect(S.takeSharedSeed(id)).toEqual({ type: 'doc' });
    expect(S.takeSharedSeed(id)).toBeNull(); // handed over once
    S.rememberShared('local-1', id);
    expect(S.sharedIdFor('local-1')).toBe(id);
    expect(S.localScriptFor(id)).toBe('local-1');
    expect(S.sharedIdFor('other')).toBeNull();
  });

  it('wiring: /shared/<id> opens it live with a fresh sign-in; the Share window replaces Collaborate on the web build', () => {
    expect(src('../App.tsx').includes('<Route path="/shared/:sharedId" element={<ScreenplayEditor />} />')).toBe(true);
    const ed = src('../components/ScreenplayEditor.tsx');
    expect(ed.includes('token: isSharedDocName(docName) ? sharedLiveToken : reviewAuthToken(token),')).toBe(true);
    expect(ed.includes('useSuggestModeStore.getState().setUid(suggesterIdOf(isSharedDocName(docName) ? sharedSuggesterKey() : inviteToken));')).toBe(true);
    expect(ed.includes("if (auth === 'signed-out') { sharedInitFor.current = null; setCollabLoginOpen(true); return; }")).toBe(true);
    expect(ed.includes("if (!await setupCollab(sharedDocName(urlSharedId), 'shared', name, meta.role === 'owner' && !!seed, undefined, role)) return;")).toBe(true);
    expect(ed.includes('onOpen={(id) => navigate(`/shared/${id}`)}')).toBe(true);
    expect(ed.includes('{!isHistoryMode && shareDialogOpen && !sharedAvailable() && currentProject && currentScriptId && (')).toBe(true);
    const dlg = src('../components/ShareScriptDialog.tsx');
    expect(dlg.includes('const made = await createShared(title ||')).toBe(true);
    expect(dlg.includes('if (seed) setSharedSeed(sid, seed);')).toBe(true);
    expect(dlg.includes('if (localScriptId) rememberShared(localScriptId, sid);')).toBe(true);
    expect(dlg.includes('if (!sharedId) { onOpen(sid); onClose(); return; }')).toBe(true);
    expect(src('../components/MenuBar.tsx').includes("(collabServerHttp() ? 'Share' : 'Collaborate')")).toBe(true);
  });
});
