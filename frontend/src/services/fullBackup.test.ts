import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildFullBackup, backupFilename, runBackup, _setBackupTestFolder, type BackupClient } from './fullBackup';
import type { ProjectInfo, ScriptMeta, ScriptResponse } from './api';

// Christian 2026-11-16: File › Backup — "it saves all your scripts and drafts into a zip … you just choose a folder".
const proj = (id: string, name: string) => ({ id, name } as unknown as ProjectInfo);
const meta = (id: string, title: string) => ({ id, title } as unknown as ScriptMeta);
const script = (id: string, title: string, text: string) => ({ meta: meta(id, title), content: { type: 'doc', text } } as unknown as ScriptResponse);

function fakeClient(): BackupClient {
  const scripts: Record<string, ScriptResponse[]> = {
    p1: [script('s1', 'Pilot', 'now'), script('s2', 'Pilot', 'other')],
    p2: [script('s3', 'Short', 'x')],
  };
  return {
    listProjects: async () => [proj('p1', 'Series'), proj('p2', 'Unfiled')],
    getProject: async (id) => proj(id, id === 'p1' ? 'Series' : 'Unfiled'),
    listScripts: async (pid) => scripts[pid].map((s) => s.meta),
    getScript: async (pid, sid) => scripts[pid].find((s) => s.meta.id === sid)!,
    getVersions: async (pid) => (pid === 'p1' ? [{ hash: 'h1', short_hash: 'h1', message: 'First draft', date: '2026-11-10T09:30:00Z' }] : []),
    getScriptAtVersion: async (_p, _h, sid) => { if (sid === 's2') throw new Error('not in that version'); return script(sid, 'Pilot', 'then'); },
  };
}

describe('File › Backup', () => {
  afterEach(() => _setBackupTestFolder(null));

  it('one zip: each project as Export Project makes it, plus every saved version', async () => {
    const r = await buildFullBackup(fakeClient(), new Date(2026, 10, 16, 14, 32));
    expect(r.filename).toBe('Screenplays backup 2026-11-16 1432.zip');
    expect(r).toMatchObject({ projects: 2, scripts: 3, versions: 1, failed: [] });
    const zip = await JSZip.loadAsync(r.data);
    expect(Object.keys(zip.files).filter((f) => !f.endsWith('/')).sort()).toEqual([
      'Series.zip', 'Unfiled.zip', 'backup.json', 'versions/Series/2026-11-10 0930 — First draft/Pilot.json',
    ]);
    const inner = await JSZip.loadAsync(await zip.file('Series.zip')!.async('uint8array'));
    expect(inner.file('project.json')).toBeTruthy(); // what Import Project reads
    expect(inner.file('scripts/Pilot (2).json')).toBeTruthy();
    expect(JSON.parse(await zip.file('backup.json')!.async('string'))).toMatchObject({ kind: 'screenplays-backup', projects: [{ name: 'Series', scripts: 2, versions: 1 }, { name: 'Unfiled' }] });
  });

  it('a project that can\'t be read is named, not silently left out', async () => {
    const c = fakeClient();
    c.getScript = async (pid, sid) => { if (pid === 'p2') throw new Error('gone'); return (await fakeClient().getScript(pid, sid)); };
    const r = await buildFullBackup(c);
    expect(r.failed).toEqual(['Unfiled']);
    expect(JSON.parse(await (await JSZip.loadAsync(r.data)).file('backup.json')!.async('string')).unreadable_projects).toEqual(['Unfiled']);
  });

  it('into the chosen folder (asking again when the browser forgot), else a download', async () => {
    const written: Record<string, number> = {};
    let asked = 0;
    const folder = {
      name: 'Script backups',
      queryPermission: async () => 'prompt' as PermissionState,
      requestPermission: async () => { asked++; return 'granted' as PermissionState; },
      getFileHandle: async (n: string) => ({ createWritable: async () => ({ write: async (d: BlobPart) => { written[n] = (d as Uint8Array).length; }, close: async () => {} }) }),
    };
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => folder;
    _setBackupTestFolder(folder);
    const out = await runBackup(fakeClient());
    expect(out.where).toBe('folder');
    expect(asked).toBe(1);
    expect(Object.values(written)[0]).toBeGreaterThan(100);
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    let got = '';
    expect((await runBackup(fakeClient(), { download: async (_d, n) => { got = n; return true; } })).where).toBe('download');
    expect(got).toMatch(/^Screenplays backup .*\.zip$/);
    expect(backupFilename(new Date(2026, 0, 2, 3, 4))).toBe('Screenplays backup 2026-01-02 0304.zip');
  });

  it('File menu: Backup in the browser build', () => {
    const src = readFileSync(new URL('../components/MenuBar.tsx', import.meta.url), 'utf8');
    expect(src.includes("...(!backupsSupported() ? [")).toBe(true);
    expect(src.includes("label: 'Back up all scripts now', action: () => { void handleWebBackup(); }")).toBe(true);
    expect(src.includes("label: webBackupFolder ? `Backup folder: ${webBackupFolder}…` : 'Choose backup folder…'")).toBe(true);
  });
});
