// Stay connected to Google Drive (services/driveTokens.ts, routes/drive.ts) — SwissCirkus 2026-11-16: "Once I'm connected, it
// just stays connected". A temporary SQLite database, the routes over real HTTP with real sign-in tokens, and a fake Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdrive-'));
process.env.DATA_DIR = dir;
process.env.DB_TYPE = 'sqlite';
process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);
process.env.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.DRIVE_TOKEN_KEY = 'ab'.repeat(32);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initDB, getDB } = require('../src/db');
const D = require('../src/services/driveTokens');
const driveRoutes = require('../src/routes/drive');
const { generateAccessToken } = require('../src/services/tokenService');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const revoked: string[] = [];
let googleEnded = false;
const fakeGoogle = {
  async exchange(code: string) {
    if (code === 'no-lasting') return { refresh_token: null, scope: SCOPE };
    if (code === 'no-drive') return { refresh_token: 'rt-x', scope: 'openid email' };
    if (code === 'signin') return { refresh_token: 'rt-signin', scope: `openid email ${SCOPE}`, access_token: 'at-signin', expires_in: 3599, id_token: 'id-new' };
    if (code === 'signin-again') return { refresh_token: null, scope: `openid email ${SCOPE}`, access_token: 'at-again', expires_in: 3599, id_token: 'id-new' };
    return { refresh_token: 'rt-' + code, scope: `openid ${SCOPE}`, access_token: 'at-first', expires_in: 3599 };
  },
  async identify(idToken: string) { return idToken === 'id-new' ? { sub: 'g-123', email: 'new@example.com', name: 'New Person' } : null; },
  async refresh(rt: string) {
    if (googleEnded) throw Object.assign(new Error('invalid_grant'), { invalidGrant: true });
    return { access_token: 'at-from-' + rt, expires_in: 3599 };
  },
  async revoke(rt: string) { revoked.push(rt); },
};

const now = () => new Date().toISOString();
async function user(id: string, email: string) {
  await getDB().run('INSERT INTO users (id, email, email_verified, display_name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)', [id, email, id, now(), now()]);
  return { id, email };
}

test('the long pass is kept encrypted — never as plain text', async () => {
  const sealed = D.seal('1//secret-refresh-token');
  assert.ok(!sealed.includes('secret-refresh-token'));
  assert.equal(D.open(sealed), '1//secret-refresh-token');
  assert.notEqual(D.seal('same'), D.seal('same')); // a fresh nonce each time
  assert.throws(() => D.open(sealed.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'))));
});

test('connect once, then fresh passes; Google ending it asks to connect again', async () => {
  await initDB();
  driveRoutes.setDriveGoogle(fakeGoogle);
  const me = await user('u-me', 'me@example.com');
  const other = await user('u-other', 'other@example.com');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/api/drive', driveRoutes.default);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const as = (u: any) => ({ authorization: 'Bearer ' + generateAccessToken(u.id, u.email), 'content-type': 'application/json' });
  const call = async (u: any, method: string, url: string, body?: any) => { const r = await fetch(base + url, { method, headers: u ? as(u) : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
  try {
    assert.equal((await call(null, 'POST', '/api/drive/token')).status, 401); // your sign-in, always
    assert.deepEqual((await call(me, 'GET', '/api/drive/status')).body, { available: true, connected: false });
    assert.equal((await call(me, 'POST', '/api/drive/token')).status, 409);

    const noLast = await call(me, 'POST', '/api/drive/connect', { code: 'no-lasting' });
    assert.equal(noLast.status, 409); assert.equal(noLast.body.needsConsent, true);
    assert.equal((await call(me, 'POST', '/api/drive/connect', { code: 'no-drive' })).status, 400);

    const c = await call(me, 'POST', '/api/drive/connect', { code: 'c1' });
    assert.equal(c.status, 200); assert.equal(c.body.access_token, 'at-first');
    const row = await getDB().get('SELECT refresh_enc FROM drive_tokens WHERE user_id = ?', ['u-me']);
    assert.ok(row && !row.refresh_enc.includes('rt-c1'));
    assert.deepEqual((await call(me, 'GET', '/api/drive/status')).body, { available: true, connected: true });

    const t = await call(me, 'POST', '/api/drive/token');
    assert.equal(t.status, 200); assert.equal(t.body.access_token, 'at-from-rt-c1');
    assert.equal(t.body.scope, `openid ${SCOPE}`); // what the pass covers, for the writer
    assert.equal((await call(other, 'POST', '/api/drive/token')).status, 409); // each person's own pass only

    await call(me, 'POST', '/api/drive/connect', { code: 'c2' }); // connecting again replaces it
    assert.equal((await call(me, 'POST', '/api/drive/token')).body.access_token, 'at-from-rt-c2');

    googleEnded = true;
    assert.equal((await call(me, 'POST', '/api/drive/token')).status, 409);
    assert.equal((await call(me, 'GET', '/api/drive/status')).body.connected, false); // forgotten here too
    googleEnded = false;

    await call(me, 'POST', '/api/drive/connect', { code: 'c3' });
    assert.equal((await call(me, 'DELETE', '/api/drive')).status, 200);
    assert.deepEqual(revoked, ['rt-c3']);
    assert.equal((await call(me, 'GET', '/api/drive/status')).body.connected, false);

    delete process.env.DRIVE_TOKEN_KEY; // a server without the key says so
    assert.equal((await call(me, 'POST', '/api/drive/token')).status, 503);
    assert.deepEqual((await call(me, 'GET', '/api/drive/status')).body, { available: false, connected: false });
  } finally { server.close(); }
});

test('one Google window: signed in here, and Drive connected for good', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  const authRoutes = require('../src/routes/auth');
  const app = express(); app.use(express.json()); app.use('/api/auth', authRoutes.default); app.use('/api/drive', driveRoutes.default);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = async (url: string, body: any, auth?: string) => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  try {
    process.env.DRIVE_TOKEN_KEY = 'ab'.repeat(32);
    const r = await post('/api/auth/google-code', { code: 'signin' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.email, 'new@example.com');
    assert.ok(r.body.accessToken && r.body.refreshToken);
    assert.deepEqual(r.body.drive, { connected: true, access_token: 'at-signin', expires_in: 3599, scope: `openid email ${SCOPE}` });
    const t = await post('/api/drive/token', {}, r.body.accessToken);
    assert.equal(t.body.access_token, 'at-from-rt-signin');
    // signing in again: Google sends no new lasting pass — the kept one carries on
    const again = await post('/api/auth/google-code', { code: 'signin-again' });
    assert.equal(again.body.drive.connected, true);
    assert.equal(again.body.user.id, r.body.user.id);
    assert.equal((await post('/api/auth/google-code', { code: 'no-drive' })).status, 400); // nobody said who
  } finally { server.close(); }
});
