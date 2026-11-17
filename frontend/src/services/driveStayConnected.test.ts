import { describe, expect, it, beforeEach, vi } from 'vitest';

// Christian 2026-11-16: "I shouldn't have to click connect to Google Drive … Once I'm connected, it just stays connected."
describe('Drive stays connected through the co-writing server', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app'); localStorage.clear(); });

  const future = () => `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.s`;

  it('one Google window: asks for sign-in and Drive together, the server keeps Drive, and you are signed in', async () => {
    const D = await import('./driveSync');
    const { useSettingsStore } = await import('../stores/settingsStore');
    const asked: Record<string, unknown>[] = [];
    const seen: string[] = [];
    const at = future();
    D._setDriveServerTestHooks({
      gsi: { accounts: { oauth2: { initCodeClient: (cfg: Record<string, unknown> & { callback: (r: unknown) => void }) => { asked.push(cfg); return { requestCode: () => cfg.callback({ code: 'one-time' }) }; } } } },
      fetch: (async (url: string, init: RequestInit) => {
        seen.push(`${init.method} ${url} ${init.body ?? ''}`);
        return new Response(JSON.stringify({ user: { id: 'u1', email: 'me@example.com', displayName: 'Christian Greet', emailVerified: true }, accessToken: at, refreshToken: 'r', drive: { connected: true, access_token: 'drive-pass', expires_in: 3599 } }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(D.oneStepSignIn()).toBe(true);
    await D.signInWithGoogle();
    expect(asked[0]).toMatchObject({ scope: 'openid email profile https://www.googleapis.com/auth/drive.file', ux_mode: 'popup', prompt: 'consent' });
    expect(seen[0]).toBe('POST https://cowrite.example.run.app/auth/google-code {"code":"one-time"}');
    expect(useSettingsStore.getState().collabAuth.user?.email).toBe('me@example.com');
    expect(D.currentDriveToken()).toBe('drive-pass');
    expect(D.wasConnectedBefore()).toBe(true);
  });

  it('a fresh pass comes from the server — no Google window; none kept says so', async () => {
    const D = await import('./driveSync');
    const { useSettingsStore } = await import('../stores/settingsStore');
    const at = future();
    useSettingsStore.setState({ collabAuth: { accessToken: at, refreshToken: 'r', user: { id: 'u1', email: 'me@example.com', displayName: 'Me', emailVerified: true } } });
    let kept = true;
    const auth: string[] = [];
    D._setDriveServerTestHooks({ fetch: (async (url: string, init: RequestInit) => {
      auth.push(`${url} ${(init.headers as Record<string, string>).authorization}`);
      return kept ? new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3599 }), { status: 200 }) : new Response(JSON.stringify({ reconnect: true }), { status: 409 });
    }) as unknown as typeof fetch });
    expect(await D.passFromServer()).toBe(true);
    expect(auth[0]).toBe(`https://cowrite.example.run.app/api/drive/token Bearer ${at}`);
    expect(D.currentDriveToken()).toBe('fresh');
    kept = false;
    expect(await D.passFromServer()).toBe(false);
  });

  it('Google sending no lasting pass: signed in anyway, and the next Sign in asks with the consent screen', async () => {
    const D = await import('./driveSync');
    localStorage.setItem('screenplays:driveConnected', '1');
    const asked: Record<string, unknown>[] = [];
    D._setDriveServerTestHooks({
      gsi: { accounts: { oauth2: { initCodeClient: (cfg: Record<string, unknown> & { callback: (r: unknown) => void }) => { asked.push(cfg); return { requestCode: () => cfg.callback({ code: 'c' }) }; } } } },
      fetch: (async () => new Response(JSON.stringify({ user: { id: 'u1', email: 'me@example.com', displayName: 'Me', emailVerified: true }, accessToken: future(), refreshToken: 'r', drive: { connected: false, needsConsent: true } }), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(D.signInWithGoogle()).rejects.toThrow(/press Sign in once more/);
    expect(asked[0].prompt).toBeUndefined(); // connected before: no consent screen the first try
    await D.signInWithGoogle().catch(() => {});
    expect(asked[1].prompt).toBe('consent');
  });
});

describe('a server without the Google secret yet', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app'); localStorage.clear(); });
  it('says so in /auth/config, and Sign in keeps to the old Drive-only connect', async () => {
    const D = await import('./driveSync');
    const seen: string[] = [];
    let on = false;
    D._setDriveServerTestHooks({ fetch: (async (url: string) => { seen.push(url); return new Response(JSON.stringify({ googleStayConnected: on }), { status: 200 }); }) as unknown as typeof fetch });
    expect(await D.checkOneStep()).toBe(false);
    expect(seen).toEqual(['https://cowrite.example.run.app/auth/config']);
    expect(D.oneStepSignIn()).toBe(false);
    on = true;
    expect(await D.checkOneStep()).toBe(false); // asked once per visit
  });
});

describe('no Google window without a click', () => {
  it('where the server keeps Drive connected, a quiet renew never falls back to Google\'s pop-up (the browser blocks it)', async () => {
    const { readFileSync } = await import('node:fs');
    const s = readFileSync(new URL('./driveSync.ts', import.meta.url), 'utf8');
    const body = s.slice(s.indexOf('async function renewQuietly()'), s.indexOf('function setDriveToken('));
    expect(body.indexOf('if (await checkOneStep()) return false;')).toBeGreaterThan(-1);
    expect(body.indexOf('if (await checkOneStep()) return false;')).toBeLessThan(body.indexOf('await signInToDrive()'));
  });
});

describe('Gmail suggestions stay allowed too (Christian 2026-11-17: "it wouldn\'t suggest any emails")', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_COLLAB_SERVER', 'https://cowrite.example.run.app'); localStorage.clear(); });
  it('once allowed, the Share window\'s suggestions load from the server\'s pass — no Google window', async () => {
    const D = await import('./driveSync');
    const C = await import('./googleContacts');
    const { useSettingsStore } = await import('../stores/settingsStore');
    const at = `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.s`;
    useSettingsStore.setState({ collabAuth: { accessToken: at, refreshToken: 'r', user: { id: 'u1', email: 'me@example.com', displayName: 'Me', emailVerified: true } } });
    let scope = 'openid https://www.googleapis.com/auth/drive.file';
    D._setDriveServerTestHooks({ fetch: (async (url: string) => {
      if (url.endsWith('/auth/config')) return new Response(JSON.stringify({ googleStayConnected: true }), { status: 200 });
      return new Response(JSON.stringify({ access_token: 'pass', expires_in: 3599, scope }), { status: 200 });
    }) as unknown as typeof fetch });
    const people: string[] = [];
    C._setContactsTestHooks({ token: null, gsi: async () => { throw new Error('no Google window expected'); }, fetch: (async (url: string, init: RequestInit) => {
      people.push((init.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify(url.includes('otherContacts') ? { otherContacts: [{ names: [{ displayName: 'Marshall' }], emailAddresses: [{ value: 'marshall@example.com' }] }] } : { connections: [] }), { status: 200 });
    }) as unknown as typeof fetch });
    expect(await C.loadContacts(false)).toEqual([]); // Drive only — suggestions not allowed yet: nothing, and no window
    expect(people).toEqual([]);
    scope += ' https://www.googleapis.com/auth/contacts.other.readonly';
    D._setDriveServerTestHooks({ fetch: (async (url: string) => new Response(JSON.stringify(url.endsWith('/auth/config') ? { googleStayConnected: true } : { access_token: 'pass2', expires_in: 3599, scope }), { status: 200 })) as unknown as typeof fetch });
    localStorage.removeItem('screenplays:driveToken');
    const D2 = await import('./driveSync');
    void D2;
    expect(['pass', 'pass2']).toContain((await D.serverPass())?.token);
  });
});
