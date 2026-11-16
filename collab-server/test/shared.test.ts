// Shared scripts (services/sharedScripts.ts, routes/shared.ts) — SwissCirkus 2026-11-16: share by email, open whenever, no host.
// Run: npm test (node --test with ts-node). A temporary SQLite database; the routes over real HTTP with real sign-in tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kshared-'));
process.env.DATA_DIR = dir;
process.env.DB_TYPE = 'sqlite';
process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initDB, getDB } = require('../src/db');
const S = require('../src/services/sharedScripts');
const { generateAccessToken } = require('../src/services/tokenService');

const now = () => new Date().toISOString();
async function user(id: string, email: string, name: string) {
  await getDB().run('INSERT INTO users (id, email, email_verified, display_name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)', [id, email, name, now(), now()]);
  return { id, email };
}

test('the rules: the owner, people it is shared with (by email, any case), nobody else', async () => {
  await initDB();
  const me = await user('u-owner', 'christian@example.com', 'Christian');
  const friend = await user('u-friend', 'marshall@example.com', 'Marshall');
  const stranger = await user('u-other', 'someone@example.com', 'Someone');
  const s = await S.createScript(getDB(), me, '  Chronicle of Inevitable Days\u0000 ', 'screenplay');
  assert.equal(s.title, 'Chronicle of Inevitable Days');
  assert.equal(await S.accessOf(getDB(), s.id, me), 'owner');
  assert.equal(await S.accessOf(getDB(), s.id, friend), null);
  await S.share(getDB(), s.id, S.normEmail('Marshall@Example.com'), 'suggester');
  assert.equal(await S.accessOf(getDB(), s.id, friend), 'suggester');
  assert.equal(await S.accessOf(getDB(), s.id, { id: 'u-friend', email: 'MARSHALL@example.com' }), 'suggester');
  assert.equal(await S.accessOf(getDB(), s.id, stranger), null);
  assert.equal(await S.accessOf(getDB(), 'not-an-id', me), null);
  assert.equal(S.liveRole('owner'), 'editor');
  const mine = await S.listFor(getDB(), me), theirs = await S.listFor(getDB(), friend);
  assert.deepEqual(mine.owned.map((x: any) => [x.title, x.shares.map((sh: any) => sh.email + ':' + sh.role).join()]), [['Chronicle of Inevitable Days', 'marshall@example.com:suggester']]);
  assert.deepEqual(theirs.sharedWithMe.map((x: any) => [x.title, x.role, x.owner.name]), [['Chronicle of Inevitable Days', 'suggester', 'Christian']]);
  assert.equal(theirs.owned.length, 0);
  // unsharing takes it away
  assert.equal(await S.unshare(getDB(), s.id, 'marshall@example.com'), true);
  assert.equal(await S.accessOf(getDB(), s.id, friend), null);
});

test('the live text is kept in the database (it outlives a restart) and the script shows when it changed', async () => {
  await initDB();
  const me = await user('u-keep', 'keep@example.com', 'Keep');
  const s = await S.createScript(getDB(), me, 'Kept', 'screenplay');
  const name = S.docNameOf(s.id);
  assert.equal(S.isSharedDoc(name), true); assert.equal(S.isSharedDoc('proj/script/nonce'), false);
  assert.equal(await S.loadState(getDB(), name), null);
  await S.storeState(getDB(), name, new Uint8Array([1, 2, 3]));
  await S.storeState(getDB(), name, new Uint8Array([4, 5, 6, 7]));
  assert.deepEqual(Array.from((await S.loadState(getDB(), name)) as Uint8Array), [4, 5, 6, 7]);
  await S.remove(getDB(), s.id);
  assert.equal(await S.loadState(getDB(), name), null, 'deleting the script deletes its text');
});

test('the routes: create, list, share, rename, unshare, delete — only the owner manages sharing', async () => {
  await initDB();
  const express = require('express');
  const sharedRoutes = require('../src/routes/shared');
  const closed: string[] = [];
  sharedRoutes.setCloseDocument((n: string) => closed.push(n));
  const app = express(); app.use(express.json()); app.use('/api/shared', sharedRoutes.default);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/shared`;
  const owner = await user('u-r-owner', 'owner@example.com', 'Owner'), guest = await user('u-r-guest', 'guest@example.com', 'Guest');
  const as = (u: any) => ({ authorization: 'Bearer ' + generateAccessToken(u.id, u.email), 'content-type': 'application/json' });
  const call = async (u: any, method: string, url: string, body?: any) => { const r = await fetch(base + url, { method, headers: u ? as(u) : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
  try {
    assert.equal((await call(null, 'GET', '/')).status, 401, 'needs a sign-in');
    const made = await call(owner, 'POST', '/', { title: 'Shared one', format: 'screenplay' });
    assert.equal(made.status, 201); const id = made.body.id;
    assert.equal(made.body.documentName, 'shared/' + id);
    assert.equal((await call(guest, 'GET', '/' + id)).status, 404, "not shared with them yet");
    assert.equal((await call(guest, 'POST', `/${id}/shares`, { email: 'x@example.com', role: 'editor' })).status, 404);
    assert.equal((await call(owner, 'POST', `/${id}/shares`, { email: 'not-an-email', role: 'editor' })).status, 400);
    assert.equal((await call(owner, 'POST', `/${id}/shares`, { email: 'guest@example.com', role: 'boss' })).status, 400);
    assert.equal((await call(owner, 'POST', `/${id}/shares`, { email: 'OWNER@example.com', role: 'editor' })).status, 400, "not with yourself");
    assert.equal((await call(owner, 'POST', `/${id}/shares`, { email: 'Guest@Example.com', role: 'editor' })).status, 201);
    const theirs = await call(guest, 'GET', '/');
    assert.deepEqual(theirs.body.sharedWithMe.map((x: any) => [x.id, x.role, x.owner.email]), [[id, 'editor', 'owner@example.com']]);
    assert.equal((await call(guest, 'PATCH', '/' + id, { title: 'Renamed by the editor' })).body.title, 'Renamed by the editor');
    assert.equal((await call(guest, 'DELETE', `/${id}/shares/guest@example.com`)).status, 403, 'an editor cannot change sharing');
    assert.equal((await call(guest, 'DELETE', '/' + id)).status, 403, 'nor delete it');
    assert.equal((await call(owner, 'DELETE', `/${id}/shares/guest@example.com`)).body.removed, true);
    assert.equal((await call(guest, 'GET', '/' + id)).status, 404, 'unshared: gone for them');
    assert.ok(closed.includes('shared/' + id), 'their live connection is closed');
    assert.equal((await call(owner, 'DELETE', '/' + id)).status, 200);
    assert.equal((await call(owner, 'GET', '/' + id)).status, 404);
  } finally { server.close(); }
});
