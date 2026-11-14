import { describe, it, expect, afterEach, vi } from 'vitest';
import { createCollabClient } from './collabClient';

/** A fake co-writing server that records each call and answers like collab-server/src/routes/collab.ts. */
function fakeServer() {
  const calls: Array<{ method: string; url: string; body: any }> = [];
  const fetcher = async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith('/api/collab/session/expired')) return new Response('{"detail":"Session not found"}', { status: 404 });
    if (url.endsWith('/api/collab/invite') && !(init.headers as any)['X-Signed-In']) return new Response('', { status: 401 });
    if (method === 'POST') return Response.json({ token: 'tok1', project_id: 'p1', script_id: 's1', collaborator_name: 'Vincent', role: 'editor', active: true });
    if (method === 'DELETE') return Response.json({ message: 'ok' });
    if (url.includes('/api/collab/sessions/')) return Response.json([]);
    return Response.json({ token: 'tok1', project_id: 'p1', script_id: 's1', collaborator_name: 'Vincent', role: 'editor', active: true });
  };
  return { calls, fetcher };
}

describe('co-writing invites on the browser library (collabClient)', () => {
  it('sends invites to our server with the same body as the desktop app', async () => {
    const { calls, fetcher } = fakeServer();
    const signedIn = (u: string, i: RequestInit = {}) => fetcher(u, { ...i, headers: { ...(i.headers as any), 'X-Signed-In': '1' } });
    const c = createCollabClient('https://cowrite.example.run.app/', signedIn);
    const s = await c.createCollabInvite('p1', 's1', 'Vincent', 'suggester', 24, 'n1');
    expect(s.token).toBe('tok1');
    expect(calls[0]).toEqual({
      method: 'POST',
      url: 'https://cowrite.example.run.app/api/collab/invite',
      body: { project_id: 'p1', script_id: 's1', collaborator_name: 'Vincent', role: 'suggester', expires_in_hours: 24, session_nonce: 'n1' },
    });
  });

  it('checks, lists and revokes sessions at the right addresses', async () => {
    const { calls, fetcher } = fakeServer();
    const c = createCollabClient('https://srv', fetcher);
    await c.validateCollabSession('a b');
    await c.listCollabSessions('p1', 's1');
    await c.revokeCollabSession('tok1');
    await c.revokeAllCollabSessions('p1', 's1');
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'GET https://srv/api/collab/session/a%20b',
      'GET https://srv/api/collab/sessions/p1/s1',
      'DELETE https://srv/api/collab/session/tok1',
      'DELETE https://srv/api/collab/sessions/p1/s1',
    ]);
  });

  it('says what to do when not signed in, and passes other errors on', async () => {
    const { fetcher } = fakeServer();
    const c = createCollabClient('https://srv', fetcher);
    await expect(c.createCollabInvite('p1', 's1', 'V')).rejects.toThrow(/Sign in to co-write/);
    await expect(c.validateCollabSession('expired')).rejects.toThrow(/404/);
  });
});

describe('co-writing server address (config)', () => {
  afterEach(() => { vi.unstubAllEnvs(); delete (window as any).__TAURI_INTERNALS__; localStorage.clear(); });
  const load = async () => { vi.resetModules(); return import('../config'); };

  it('sends sign-in and live sync to VITE_COLLAB_SERVER on the web build', async () => {
    vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app/');
    const c = await load();
    expect(c.collabServerHttp()).toBe('https://cowrite.example.run.app');
    expect(c.getAuthBase()).toBe('https://cowrite.example.run.app/auth');
    expect(c.getCollabWsUrl()).toBe('wss://cowrite.example.run.app');
  });

  it("leaves upstream's behaviour alone without it, and on the desktop app", async () => {
    vi.stubEnv('VITE_COLLAB_SERVER', '');
    let c = await load();
    expect(c.collabServerHttp()).toBe('');
    expect(c.getAuthBase()).toBe(`${c.getApiBase()}/auth`);
    expect(c.getCollabWsUrl()).toBe('wss://collab.open-draft.com');
    vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app');
    (window as any).__TAURI_INTERNALS__ = {};
    c = await load();
    expect(c.collabServerHttp()).toBe('');
  });
});
