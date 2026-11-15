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
      files.set(id, { id, name: meta.name || '', parents: meta.parents, appProperties: meta.appProperties as Record<string, string> | undefined, mimeType: meta.mimeType, body: toBlob(body) });
      return files.get(id)!;
    },
    async update(id, meta, body) {
      if (!signedIn) throw new DriveAuthError('expired');
      const f = files.get(id);
      if (!f || f.trashed) throw new DriveNotFoundError(id);
      if (meta.name) f.name = meta.name;
      // Like Drive: appProperties merge, and a null value removes the key.
      if (meta.appProperties) {
        const next: Record<string, string> = { ...(f.appProperties ?? {}) };
        for (const [k, v] of Object.entries(meta.appProperties)) { if (v === null) delete next[k]; else next[k] = v; }
        f.appProperties = next;
      }
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
  const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u), loadMissingContent: (p, sid) => sync.loadScript(p, sid) });
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

  it('Remove (keep in Google Drive) leaves the files in Drive, and no copy brings the project back', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Kept');
    await a.lib.createScript(p.id, { title: 'Draft', content: doc('stays') });
    await a.sync.flush();
    await a.lib.removeProjectKeepDrive(p.id);
    await a.sync.flush();
    expect(await a.lib.listProjects()).toEqual([]);
    // still in Drive, not binned
    expect(drive.paths()).toEqual(expect.arrayContaining(['Screenplays/Kept/project.json', 'Screenplays/Kept/Draft.screenplay.json', 'Screenplays/Kept/Draft.fountain']));
    // a fresh copy of the writer (another browser, or this one after a reload) doesn't bring it back
    const b = device(drive);
    await b.sync.connect();
    expect(await b.lib.listProjects()).toEqual([]);
    await a.sync.connect();
    expect(await a.lib.listProjects()).toEqual([]);
  });

  it("a second copy fetches Google Doc links first, before script texts and originals, and shows them", async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Docs');
    await a.lib.createScript(p.id, { title: 'Draft', content: doc('text') });
    await a.lib.uploadAsset(p.id, new File([new Uint8Array(5000)], 'big.pdf', { type: 'application/pdf' }), ['original']);
    await a.lib.uploadAsset(p.id, new File(['[InternetShortcut]\nURL=https://docs.google.com/document/d/x/edit\n'], 'Notes.url', { type: 'application/internet-shortcut' }));
    await a.sync.flush();

    const kv = createMemoryKv();
    const order: string[] = [];
    const real = drive.t.download.bind(drive.t);
    const t = { ...drive.t, download: async (id: string) => { order.push(id); return real(id); } };
    let shown = 0;
    const sync = createDriveSync(kv, t, { debounceMs: 0, toFountain: async () => '', onPulled: () => { shown++; } });
    const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u), loadMissingContent: (pp, sid) => sync.loadScript(pp, sid) });
    await sync.connect();
    await sync.whenFilled();
    const names = (await lib.listAssets(p.id)).map((x: { original_name: string }) => x.original_name).sort();
    expect(names).toEqual(['Notes.url', 'big.pdf']);
    const nameOf = (id: string) => [...drive.files.values()].find((f) => f.id === id)?.name ?? '';
    const firstLink = order.findIndex((id) => nameOf(id) === 'Notes.url');
    const firstScript = order.findIndex((id) => nameOf(id).endsWith('.screenplay.json'));
    const firstPdf = order.findIndex((id) => nameOf(id) === 'big.pdf');
    expect(firstLink).toBeGreaterThanOrEqual(0);
    expect(firstLink).toBeLessThan(firstPdf);
    if (firstScript >= 0) expect(firstLink).toBeLessThan(firstScript);
    expect(shown).toBeGreaterThan(0);
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
    await b.sync.whenFilled(); // versions and originals come in the background
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

describe('fast loading from Drive', () => {
  it('a second browser brings everything in with a handful of searches, not one per script, and shows progress', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    for (let p = 0; p < 3; p++) {
      const proj = await a.lib.createProject(`Film ${p}`);
      for (let s = 0; s < 6; s++) await a.lib.createScript(proj.id, { title: `Draft ${s}`, content: doc(`p${p}s${s}`) });
      await a.lib.uploadAsset(proj.id, new File([new Uint8Array([p])], `orig${p}.fdx`), ['original']);
    }
    await a.sync.flush();

    let finds = 0;
    const counting = { ...drive.t, find: (props: Record<string, string>, parent?: string) => { finds++; return drive.t.find(props, parent); } };
    const kv = createMemoryKv();
    let shown = 0;
    const sync = createDriveSync(kv, counting, { debounceMs: 0, onPulled: () => { shown++; } });
    const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u), loadMissingContent: (p, sid) => sync.loadScript(p, sid) });
    await sync.connect();
    await sync.whenFilled(); // texts, versions and originals come in the background
    expect((await lib.listProjects()).length).toBe(3);
    for (const p of await lib.listProjects()) {
      expect((await lib.listScripts(p.id)).length).toBe(6);
      expect((await lib.listAssets(p.id)).length).toBe(1);
    }
    expect(finds).toBeLessThanOrEqual(8); // root + 4 kinds + templates — was 1 + 18 scripts + 3 versions + 3 assets
    expect(shown).toBeGreaterThan(0);
  });
});

describe('names first, texts after', () => {
  it('the projects and script names arrive at connect; a script opened before its text arrived fetches it then', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('Charlotte');
    const s = await a.lib.createScript(p.id, { title: 'Draft 1', content: doc('the real text') });
    await a.sync.flush();

    // A browser whose Drive is slow to hand out script texts.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const slow = { ...drive.t, download: async (id: string) => { const f = [...drive.files.values()].find((x) => x.id === id); if (f?.name.endsWith('.screenplay.json')) await gate; return drive.t.download(id); } };
    const kv = createMemoryKv();
    const sync = createDriveSync(kv, slow, { debounceMs: 0 });
    const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u), loadMissingContent: (pid, sid) => sync.loadScript(pid, sid) });
    await sync.connect(); // returns although no script text has come yet
    expect((await lib.listProjects()).map((x) => x.name)).toEqual(['Charlotte']);
    expect((await lib.listScripts(p.id)).map((x) => x.title)).toEqual(['Draft 1']);
    const opening = lib.getScript(p.id, s.meta.id);
    release();
    expect((await opening).content).toEqual(doc('the real text'));
    await sync.whenFilled();
    // a check-in after that has the real text, never an empty script
    await lib.checkin(p.id, 'v1');
    expect((await lib.getScriptAtVersion(p.id, (await lib.getVersions(p.id))[0].hash, s.meta.id)).content).toEqual(doc('the real text'));
  });

  it('a script whose text has not come in is never uploaded empty', async () => {
    const drive = fakeDrive();
    const a = device(drive);
    await a.sync.connect();
    const p = await a.lib.createProject('P');
    const s = await a.lib.createScript(p.id, { title: 'T', content: doc('keep me') });
    await a.sync.flush();
    const kv = createMemoryKv();
    const sync = createDriveSync(kv, drive.t, { debounceMs: 0 });
    const lib = createWebStorage(kv, { onChange: (u) => sync.markDirty(u), loadMissingContent: (pid, sid) => sync.loadScript(pid, sid) });
    await sync.connect();
    await lib.reorderScripts(p.id, [{ id: s.meta.id, sort_order: 3 }]); // touches the script before its text is fetched
    await sync.flush();
    await sync.whenFilled();
    expect(JSON.parse((await drive.text('T.screenplay.json'))!).content).toEqual(doc('keep me'));
  });
});
