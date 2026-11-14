import { describe, it, expect } from 'vitest';
import { createMemoryKv } from './kvStore';
import { createWebStorage, parseLocationFromHeading, type ChangeUnit } from './web-storage';

const doc = (...lines: Array<[string, string]>) => ({
  type: 'doc',
  content: lines.map(([type, text]) => ({ type, content: [{ type: 'text', text }] })),
});

function setup() {
  const changes: ChangeUnit[] = [];
  const kv = createMemoryKv();
  const s = createWebStorage(kv, { onChange: (u) => changes.push(u) });
  return { s, kv, changes };
}

describe('browser library (web-storage)', () => {
  it('creates, lists, renames and deletes projects', async () => {
    const { s, changes } = setup();
    const p = await s.createProject('Goldpaw');
    expect((await s.listProjects()).map((x) => x.name)).toEqual(['Goldpaw']);
    const renamed = await s.updateProject(p.id, { name: 'Goldpaw II', properties: { genre: 'Drama' } });
    expect(renamed.name).toBe('Goldpaw II');
    expect(renamed.properties.genre).toBe('Drama');
    expect(renamed.properties.language).toBe('en');
    await s.deleteProject(p.id);
    expect(await s.listProjects()).toEqual([]);
    expect(changes.at(-1)).toEqual({ kind: 'project', projectId: p.id, deleted: true });
  });

  it('saves a script and reads it back exactly', async () => {
    const { s } = setup();
    const p = await s.createProject('P');
    const content = doc(['sceneHeading', 'INT. KITCHEN - DAY'], ['action', 'Mara oils the lamp.']);
    const created = await s.createScript(p.id, { title: 'Draft 1', content });
    const saved = await s.saveScript(p.id, created.meta.id, { content: doc(['sceneHeading', 'EXT. CLIFF - NIGHT']) });
    expect(saved.meta.updated_at > created.meta.updated_at).toBe(true);
    const got = await s.getScript(p.id, created.meta.id);
    expect(got.content).toEqual(doc(['sceneHeading', 'EXT. CLIFF - NIGHT']));
    expect(got.meta.title).toBe('Draft 1');
    expect((await s.getProject(p.id)).updated_at).toBe(saved.meta.updated_at);
  });

  it('refuses to save an empty document over a written one', async () => {
    const { s } = setup();
    const p = await s.createProject('P');
    const c = await s.createScript(p.id, { title: 'T', content: doc(['action', 'Words.']) });
    await expect(s.saveScript(p.id, c.meta.id, { content: { type: 'doc', content: [] } })).rejects.toThrow(/Refusing/);
    expect((await s.getScript(p.id, c.meta.id)).content).toEqual(doc(['action', 'Words.']));
  });

  it('duplicates, reorders and deletes scripts', async () => {
    const { s } = setup();
    const p = await s.createProject('P');
    const a = await s.createScript(p.id, { title: 'A', content: doc(['action', 'x']) });
    const b = await s.duplicateScript(p.id, a.meta.id);
    expect(b.meta.title).toBe('A (Copy)');
    expect(b.content).toEqual(a.content);
    await s.reorderScripts(p.id, [{ id: b.meta.id, sort_order: 0 }, { id: a.meta.id, sort_order: 1 }]);
    expect((await s.getScript(p.id, a.meta.id)).meta.sort_order).toBe(1);
    await s.deleteScript(p.id, a.meta.id);
    expect((await s.listScripts(p.id)).map((m) => m.id)).toEqual([b.meta.id]);
  });

  it('checks in versions, diffs them and restores one', async () => {
    const { s } = setup();
    const p = await s.createProject('P');
    const a = await s.createScript(p.id, { title: 'A', content: doc(['action', 'first']) });
    const v1 = await s.checkin(p.id, 'first draft');
    await s.saveScript(p.id, a.meta.id, { content: doc(['action', 'second']) });
    const extra = await s.createScript(p.id, { title: 'B', content: doc(['action', 'b']) });
    const v2 = await s.checkin(p.id, 'second draft');

    expect((await s.getVersions(p.id)).map((v) => v.message)).toEqual(['second draft', 'first draft']);
    expect((await s.getVersions(p.id, extra.meta.id)).map((v) => v.hash)).toEqual([v2.hash]);
    const diff = await s.getVersionDiff(p.id, v1.hash, v2.hash);
    expect(diff.diff).toContain('+++ New script: B');
    expect(diff.diff).toContain('@@ modified @@');
    expect((await s.getScriptAtVersion(p.id, v1.hash, a.meta.id)).content).toEqual(doc(['action', 'first']));

    await s.restoreVersion(p.id, v1.hash);
    expect((await s.getScript(p.id, a.meta.id)).content).toEqual(doc(['action', 'first']));
    expect((await s.listScripts(p.id)).map((m) => m.title)).toEqual(['A']);

    await s.deleteVersion(p.id, v1.hash);
    expect((await s.getVersions(p.id)).map((v) => v.hash)).toEqual([v2.hash]);
  });

  it('finds locations from scene headings like the server does', async () => {
    expect(parseLocationFromHeading('INT. KITCHEN - DAY')).toEqual({ name: 'KITCHEN', type: 'interior' });
    expect(parseLocationFromHeading('EXT. CLIFF PATH - NIGHT')).toEqual({ name: 'CLIFF PATH', type: 'exterior' });
    expect(parseLocationFromHeading('INT./EXT. CAR - CONTINUOUS')).toEqual({ name: 'CAR', type: 'both' });
    const { s } = setup();
    const p = await s.createProject('P');
    await s.createScript(p.id, { title: 'A', content: doc(['sceneHeading', 'INT. KITCHEN - DAY'], ['sceneHeading', 'EXT. KITCHEN - NIGHT'], ['sceneHeading', 'EXT. CLIFF - DUSK']) });
    await s.createLocation(p.id, { name: 'cliff' });
    const found = await s.discoverLocations(p.id);
    expect(found.discovered).toBe(1);
    expect(found.locations.map((l) => `${l.name}:${l.type}`).sort()).toEqual(['CLIFF:interior', 'KITCHEN:both']);
    const kitchen = found.locations.find((l) => l.name === 'KITCHEN')!;
    expect((await s.updateLocation(p.id, kitchen.id, { notes: 'small' })).notes).toBe('small');
    await s.deleteLocation(p.id, kitchen.id);
    expect((await s.listLocations(p.id)).map((l) => l.name)).toEqual(['CLIFF']);
  });

  it('stores assets and serves them through webasset: URLs', async () => {
    const { s } = setup();
    const p = await s.createProject('P');
    const file = new File([new Uint8Array([1, 2, 3])], 'frame.png', { type: 'image/png' });
    const meta = await s.uploadAsset(p.id, file, ['ref']);
    const url = s.getAssetUrl(p.id, meta.id);
    expect(url).toBe(`webasset:${p.id}/${meta.id}`);
    const res = await s.fetchWebAsset(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    await s.deleteAsset(p.id, meta.id);
    expect((await s.fetchWebAsset(url)).status).toBe(404);
  });

  it('keeps formatting templates', async () => {
    const { s } = setup();
    await s.createFormattingTemplate({ id: 't1', name: 'Stage play', rules: {} });
    await s.updateFormattingTemplate('t1', { name: 'Stage', rules: { x: 1 } });
    expect(await s.listFormattingTemplates()).toEqual([{ id: 't1', name: 'Stage', rules: { x: 1 } }]);
    await s.deleteFormattingTemplate('t1');
    expect(await s.listFormattingTemplates()).toEqual([]);
  });
});
