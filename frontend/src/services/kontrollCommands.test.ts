import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = { projects: [] as Array<{ id: string; name: string }>, scripts: new Map<string, Array<{ id: string; title: string; format: string; content: unknown; updated_at: string }>>() };
let n = 0;
vi.mock('./api', () => ({
  api: {
    listProjects: async () => store.projects,
    createProject: async (name: string) => { const p = { id: 'p' + (++n), name }; store.projects.push(p); store.scripts.set(p.id, []); return p; },
    listScripts: async (pid: string) => (store.scripts.get(pid) || []).map(({ content: _c, ...m }) => m),
    createScript: async (pid: string, d: { title: string; format?: string; content?: unknown }) => { const s = { id: 's' + (++n), title: d.title, format: d.format || 'screenplay', content: d.content, updated_at: 'now' }; store.scripts.get(pid)!.push(s); return { meta: s, content: d.content }; },
    getScript: async (pid: string, sid: string) => { const s = store.scripts.get(pid)!.find((x) => x.id === sid)!; return { meta: s, content: s.content }; },
    saveScript: async (pid: string, sid: string, d: { content?: unknown }) => { const s = store.scripts.get(pid)!.find((x) => x.id === sid)!; s.content = d.content; return { meta: s, content: s.content }; },
  },
}));

import { runKontrollCommand, setKontrollNavigate, setKontrollCurrentScript } from './kontrollCommands';

const FOUNTAIN = 'EXT. LIGHTHOUSE - NIGHT\n\nRain lashes the tower.\n\nTHOMAS\nNot tonight.\n';

describe('Kontroll commands (Story Builder ↔ the writer)', () => {
  beforeEach(() => { store.projects = []; store.scripts = new Map(); n = 0; setKontrollNavigate(null); setKontrollCurrentScript(null); });

  it('answers ready and refuses unknown commands', async () => {
    expect(await runKontrollCommand('ready', {})).toEqual({ ok: true });
    expect((await runKontrollCommand('nope', {})).ok).toBe(false);
  });

  it('makes a project with the outline as a Treatment and the script, and reuses a project of the same name', async () => {
    const a = await runKontrollCommand('createProject', { name: 'Lighthouse', outline: 'A keeper.\n\nA storm.', fountain: FOUNTAIN });
    expect(a.ok).toBe(true);
    const scripts = store.scripts.get(String(a.projectId))!;
    expect(scripts.map((s) => s.format)).toEqual(['treatment', 'screenplay']);
    const b = await runKontrollCommand('createProject', { name: 'lighthouse', fountain: '' });
    expect(b.projectId).toBe(a.projectId);
    expect(store.projects.length).toBe(1);
  });

  it('lists projects with their screenplays only, and reads a script back as Fountain', async () => {
    const a = await runKontrollCommand('createProject', { name: 'Lighthouse', outline: 'Outline', fountain: FOUNTAIN });
    const list = await runKontrollCommand('listProjects', {});
    const p = (list.projects as Array<{ scripts: Array<{ id: string }> }>)[0];
    expect(p.scripts.length).toBe(1);
    const g = await runKontrollCommand('getScript', { projectId: a.projectId, scriptId: a.scriptId });
    expect(String(g.fountain)).toContain('EXT. LIGHTHOUSE - NIGHT');
    expect(String(g.fountain)).toContain('THOMAS');
  });

  it('prefers what is on screen for the open script, and opens a script through the router', async () => {
    setKontrollCurrentScript(() => ({ projectId: 'p1', scriptId: 's2', title: 'Live', fountain: 'INT. ROOM - DAY\n' }));
    const g = await runKontrollCommand('getScript', { projectId: 'p1', scriptId: 's2' });
    expect(g.fountain).toBe('INT. ROOM - DAY\n');
    expect((await runKontrollCommand('openScript', { projectId: 'p1', scriptId: 's2' })).ok).toBe(false);
    const nav = vi.fn(); setKontrollNavigate(nav);
    expect((await runKontrollCommand('openScript', { projectId: 'p1', scriptId: 's2' })).ok).toBe(true);
    expect(nav).toHaveBeenCalledWith('/project/p1/edit/s2');
  });
});
