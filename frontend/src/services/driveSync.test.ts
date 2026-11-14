import { describe, it, expect } from 'vitest';
import { createMemoryKv } from './kvStore';
import { createWebStorage } from './web-storage';
import {
  createDriveSync,
  DriveAuthError,
  DriveNotFoundError,
  useDriveStatus,
  type DriveFile,
  type DriveMeta,
  type DriveTransport,
} from './driveSync';

/** An in-memory Google Drive with the calls driveSync makes. */
function fakeDrive() {
  let n = 0;
  const files = new Map<string, DriveFile & { mimeType?: string; trashed?: boolean; body?: Blob }>();
  let signedIn = true;
  const toBlob = (b?: Blob | string) => (b === undefined ? undefined : typeof b === 'string' ? new Blob([b]) : b);
  const t: DriveTransport = {
    async find(props, parent) {
      if (!signedIn) throw new DriveAuthError('expired');
      return [...files.values()].filter((f) =>
        !f.trashed &&
        Object.entries(props).every(([k, v]) => f.appProperties?.[k] === v) &&
        (!parent || f.parents?.includes(parent)));
    },
    async create(meta: DriveMeta, body) {
      if (!signedIn) throw new DriveAuthError('expired');
      const id = `f${++n}`;
      files.set(id, { id, name: meta.name || '', parents: meta.parents, appProperties: meta.appProperties, mimeType: meta.mimeType, body: toBlob(body) });
      return files.get(id)!;
    },
    async update(id, meta, body) {
      if (!signedIn) throw new DriveAuthError('expired');
      const f = files.get(id);
      if (!f || f.trashed) throw new DriveNotFoundError(id);
      if (meta.name) f.name = meta.name;
      if (body !== undefined) f.body = toBlob(body);
      return f;
    },
    async download(id) {
      const f = files.get(id);
      if (!f || f.trashed || !f.body) throw new DriveNotFoundError(id);
      return f.body;
    },
    async trash(id) {
      const f = files.get(id);
      if (!f) throw new DriveNotFoundError(id);
      // Like Drive: a binned folder takes its contents with it.
      const bin = (x: typeof f) => {
        x.trashed = true;
        for (const c of files.values()) if (c.parents?.includes(x.id)) bin(c);
      };
      bin(f);
    },
  };
  const live = () => [...files.values()].filter((f) => !f.trashed);
  const path = (f: DriveFile): string => {
    const parent = f.parents?.[0] ? files.get(f.parents[0]) : undefined;
    return parent ? `${path(parent)}/${f.name}` : f.name;
  };
  return {
    t, files,
    paths: () => live().map(path).sort(),
    text: async (name: string) => {
      const f = live().find((x) => x.name === name);
      return f?.body ? f.body.text() : undefined;
    },
    signOut: () => { signedIn = false; },
    signIn: () => { signedIn = true; },
  };
}

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'action', content: [{ type: 'text', text }] }] });

function device(drive: ReturnType<typeof fakeDrive>) {
  const kv = createMemoryKv();
  const sync = createDriveSync(kv, drive.t, { debounceMs: 0, toFountain: async (c: any) => `FOUNTAIN:${c.content[0].content[0].text}` });
  const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u) });
  return { kv, sync, lib };
}

describe('Google Drive mirror (driveSync)', () => {
  it('writes the Screenplays folder layout', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Goldpaw');
    const s = await a.lib.createScript(p.id, { title: 'Draft 5', content: doc('Mara oils the lamp.') });
    await a.lib.checkin(p.id, 'table read');
    await a.lib.uploadAsset(p.id, new File([new Uint8Array([7])], 'frame.png', { type: 'image/png' }));
    await a.sync.flush();

    const paths = drive.paths();
    expect(paths).toContain('Screenplays/Goldpaw/project.json');
    expect(paths).toContain('Screenplays/Goldpaw/Draft 5.screenplay.json');
    expect(paths).toContain('Screenplays/Goldpaw/Draft 5.fountain');
    expect(paths).toContain('Screenplays/Goldpaw/assets/frame.png');
    expect(paths.some((x) => /^Screenplays\/Goldpaw\/versions\/.* table read\.json$/.test(x))).toBe(true);
    expect(await drive.text('Draft 5.fountain')).toBe('FOUNTAIN:Mara oils the lamp.');
    const pj = JSON.parse((await drive.text('project.json'))!);
    expect(pj.scripts.map((m: any) => m.id)).toEqual([s.meta.id]);
    expect(pj.assets).toHaveLength(1);
    expect(await a.sync.pending()).toEqual([]);
  });

  it('keeps changes queued while disconnected and sends them on connect', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    const p = await a.lib.createProject('Offline');
    await a.lib.createScript(p.id, { title: 'One', content: doc('x') });
    await a.sync.flush();
    expect(drive.paths()).toEqual([]);
    expect((await a.sync.pending()).length).toBeGreaterThan(0);
    await a.sync.connect();
    expect(drive.paths()).toContain('Screenplays/Offline/One.screenplay.json');
    expect(await a.sync.pending()).toEqual([]);
  });

  it('renames follow the project and script, without duplicates', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Old');
    const s = await a.lib.createScript(p.id, { title: 'First', content: doc('x') });
    await a.sync.flush();
    await a.lib.updateProject(p.id, { name: 'New' });
    await a.lib.saveScript(p.id, s.meta.id, { title: 'Second' });
    await a.sync.flush();
    expect(drive.paths()).toEqual([
      'Screenplays',
      'Screenplays/New',
      'Screenplays/New/Second.fountain',
      'Screenplays/New/Second.screenplay.json',
      'Screenplays/New/project.json',
    ]);
  });

  it('deleting moves the Drive files to the bin', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('P');
    const s = await a.lib.createScript(p.id, { title: 'Gone', content: doc('x') });
    await a.sync.flush();
    await a.lib.deleteScript(p.id, s.meta.id);
    await a.sync.flush();
    expect(drive.paths()).toEqual(['Screenplays', 'Screenplays/P', 'Screenplays/P/project.json']);
    await a.lib.deleteProject(p.id);
    await a.sync.flush();
    expect(drive.paths()).toEqual(['Screenplays']);
  });

  it('a second browser pulls everything on connect, and newer edits win', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Shared');
    const s = await a.lib.createScript(p.id, { title: 'Script', content: doc('from A') });
    await a.lib.checkin(p.id, 'v1');
    await a.lib.uploadAsset(p.id, new File([new Uint8Array([9])], 'ref.jpg', { type: 'image/jpeg' }));
    await a.sync.flush();

    const b = device(drive);
    const pulled = await b.sync.connect();
    expect(pulled).toBeGreaterThan(0);
    expect((await b.lib.listProjects()).map((x) => x.name)).toEqual(['Shared']);
    expect((await b.lib.getScript(p.id, s.meta.id)).content).toEqual(doc('from A'));
    expect((await b.lib.getVersions(p.id)).map((v) => v.message)).toEqual(['v1']);
    expect(await b.lib.listAssets(p.id)).toHaveLength(1);

    // B edits; A pulls it on its next connect.
    await b.lib.saveScript(p.id, s.meta.id, { content: doc('from B') });
    await b.sync.flush();
    await a.sync.connect();
    expect((await a.lib.getScript(p.id, s.meta.id)).content).toEqual(doc('from B'));
    // No duplicate files from two writers.
    expect(drive.paths().filter((x) => x.endsWith('.screenplay.json'))).toEqual(['Screenplays/Shared/Script.screenplay.json']);
  });

  it('an expired sign-in keeps the queue and says so', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('P');
    drive.signOut();
    await a.lib.createScript(p.id, { title: 'Later', content: doc('x') });
    await a.sync.flush();
    expect(useDriveStatus.getState().state).toBe('expired');
    expect((await a.sync.pending()).length).toBeGreaterThan(0);
    drive.signIn();
    await a.sync.connect();
    expect(drive.paths()).toContain('Screenplays/P/Later.screenplay.json');
    expect(await a.sync.pending()).toEqual([]);
  });

  it('recreates a file someone deleted from Drive', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('P');
    const s = await a.lib.createScript(p.id, { title: 'S', content: doc('x') });
    await a.sync.flush();
    const f = [...drive.files.values()].find((x) => x.name === 'S.screenplay.json')!;
    await drive.t.trash(f.id);
    await a.lib.saveScript(p.id, s.meta.id, { content: doc('y') });
    await a.sync.flush();
    expect(JSON.parse((await drive.text('S.screenplay.json'))!).content).toEqual(doc('y'));
  });
});

describe('imported originals', () => {
  it("a script's original file goes to the project's Original folder; other files to assets", async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Charlotte');
    await a.lib.uploadAsset(p.id, new File([new Uint8Array([1])], 'Charlotte Draft 3.fdx'), ['original']);
    await a.lib.uploadAsset(p.id, new File([new Uint8Array([2])], 'moodboard.jpg', { type: 'image/jpeg' }));
    await a.sync.flush();
    expect(drive.paths()).toContain('Screenplays/Charlotte/Original/Charlotte Draft 3.fdx');
    expect(drive.paths()).toContain('Screenplays/Charlotte/assets/moodboard.jpg');
  });
});
