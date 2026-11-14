import { describe, it, expect } from 'vitest';
import {
  buildOrganisePrompt, buildProjects, importableOnly, matchExisting, mergeSameNames, parseOrganiseReply,
  planByFolder, planByTitle, projectNameFrom, readCandidates, scriptKey, summarise, type Candidate,
} from './bulkImport';
import type { ParseImport } from './importScriptFiles';

const file = (name: string, body = 'x') => new File([body], name, { type: 'text/plain' });

// The parsed shape parseScreenplayImport really returns: a TipTap doc (titlePage attrs tp*, sceneHeading, character…).
const parsed = (title: string, opts: { author?: string; draft?: string; scene?: string; chars?: string[] } = {}) => ({
  title, formatLabel: 'Fountain', warnings: [],
  doc: {
    type: 'doc',
    content: [
      { type: 'titlePage', attrs: { field: 'title', tpTitle: title, tpWrittenBy: opts.author || '', tpDraft: opts.draft || '' } },
      { type: 'sceneHeading', content: [{ type: 'text', text: opts.scene || 'INT. KITCHEN - DAY' }] },
      ...(opts.chars || ['MARA', 'MARA', 'TOM']).map((c) => ({ type: 'character', content: [{ type: 'text', text: c }] })),
    ],
  },
});

const cand = (id: string, title: string, extra: Partial<Candidate> = {}): Candidate => ({
  id, file: file(`${title}.fountain`), name: `${title}.fountain`, folder: '', title,
  author: '', draft: '', firstScene: '', characters: [], scenes: 1, doc: { type: 'doc', content: [] }, ...extra,
});

describe('bulk import: reading the files', () => {
  it('keeps only importable files, skipping hidden ones', () => {
    const r = importableOnly([
      { file: file('Goldpaw.fdx'), folder: '' }, { file: file('notes.jpg'), folder: '' },
      { file: file('.DS_Store'), folder: 'old' }, { file: file('Pilot.fountain'), folder: 'tv' },
    ]);
    expect(r.files.map((f) => f.file.name)).toEqual(['Goldpaw.fdx', 'Pilot.fountain']);
    expect(r.ignored).toEqual(['notes.jpg', '.DS_Store']);
  });

  it('summarises a script: title page author and draft, first scene, main characters', () => {
    const s = summarise(parsed('GOLDPAW', { author: 'C. Writer', draft: 'Draft 5', scene: 'EXT. CLIFF - NIGHT', chars: ['MARA', 'TOM (V.O.)', 'MARA', 'TOM'] }).doc);
    expect(s).toEqual({ author: 'C. Writer', draft: 'Draft 5', titlePageTitle: 'GOLDPAW', firstScene: 'EXT. CLIFF - NIGHT', characters: ['MARA', 'TOM'], scenes: 1 });
  });

  it('parses each file once, headless (no PDF preview), in name order, and keeps a broken file with its error', async () => {
    const calls: Array<[string, unknown]> = [];
    const parse: ParseImport = async (name, _data, opts) => {
      calls.push([name, opts]);
      if (name.startsWith('Broken')) throw new Error('not a script');
      return parsed(name.replace(/\.\w+$/, ''));
    };
    const c = await readCandidates([
      { file: file('Draft 10.fountain'), folder: 'Goldpaw' }, { file: file('Draft 2.fountain'), folder: 'Goldpaw' },
      { file: file('Broken.fdx'), folder: '' },
    ], parse);
    expect(calls.map((x) => x[0])).toEqual(['Broken.fdx', 'Draft 2.fountain', 'Draft 10.fountain']);
    expect(calls[0][1]).toEqual({ hydrateStores: false, review: false });
    expect(c.map((x) => [x.id, x.name, x.folder, x.error ?? ''])).toEqual([
      ['f1', 'Broken.fdx', '', 'not a script'], ['f2', 'Draft 2.fountain', 'Goldpaw', ''], ['f3', 'Draft 10.fountain', 'Goldpaw', ''],
    ]);
  });
});

describe('bulk import: plans', () => {
  it('scriptKey strips drafts, revisions, colours, dates and copies', () => {
    for (const t of ['Goldpaw', 'GOLDPAW - Draft 5', 'Goldpaw_v2', 'Goldpaw (2)', 'Goldpaw Rev. 3', 'Goldpaw BLUE revision', 'Goldpaw 2024-03-11', 'goldpaw - copy', 'Goldpaw final draft', 'Goldpaw Screenplay', 'GOLDPAW script v3']) {
      expect(scriptKey(t), t).toBe('goldpaw');
    }
    expect(scriptKey('The Lighthouse')).not.toBe(scriptKey('Goldpaw'));
  });

  it('project names drop the draft marks but keep the title', () => {
    expect(projectNameFrom('GOLDPAW - Draft 5')).toBe('Goldpaw');
    expect(projectNameFrom('The Lighthouse_v3 (2)')).toBe('The Lighthouse');
    expect(projectNameFrom('Night Shift BLUE revision 2024-03-11')).toBe('Night Shift');
    expect(projectNameFrom('Draft 2')).toBe('Draft 2');
    expect(projectNameFrom('Charlotte Screenplay')).toBe('Charlotte');
  });

  it('as they are: each dropped folder is a project, loose files go into one', () => {
    const p = planByFolder([cand('f1', 'A', { folder: 'Goldpaw/old' }), cand('f2', 'B', { folder: 'Goldpaw' }), cand('f3', 'C'), cand('f4', 'D', { error: 'x' })], 'Imported scripts');
    expect(p).toEqual([{ name: 'Goldpaw', fileIds: ['f1', 'f2'] }, { name: 'Imported scripts', fileIds: ['f3'] }]);
  });

  it('the quick guess groups drafts of one script and names the project after it', () => {
    const p = planByTitle([cand('f1', 'GOLDPAW'), cand('f2', 'Goldpaw - Draft 5'), cand('f3', 'The Lighthouse'), cand('f4', 'Goldpaw_v2')]);
    expect(p).toEqual([{ name: 'Goldpaw', fileIds: ['f1', 'f2', 'f4'] }, { name: 'The Lighthouse', fileIds: ['f3'] }]);
  });

  it('the assistant gets one line per readable file', () => {
    const prompt = buildOrganisePrompt([cand('f1', 'Goldpaw', { author: 'C', draft: 'Draft 5', folder: 'old', characters: ['MARA'] }), cand('f2', 'X', { error: 'bad' })]);
    expect(prompt).toContain('Sort these 1 files');
    expect(prompt).toContain('- f1 · file "Goldpaw.fountain" · folder "old" · title "Goldpaw" · by C · draft "Draft 5"');
    expect(prompt).not.toContain('f2');
  });

  it("the assistant's answer is checked: unknown ids dropped, duplicates kept once, missing files still placed", () => {
    const cands = [cand('f1', 'Goldpaw'), cand('f2', 'Goldpaw v2'), cand('f3', 'Lighthouse'), cand('f4', 'Lighthouse draft 2')];
    const reply = 'Here you go: {"projects":[{"name":"Goldpaw","files":["f1","f2","f9"]},{"name":"goldpaw","files":["f2","f3"]}]}';
    const plan = parseOrganiseReply(reply, cands)!;
    expect(plan).toEqual([{ name: 'Goldpaw', fileIds: ['f1', 'f2', 'f3'] }, { name: 'Lighthouse', fileIds: ['f4'] }]);
    expect(parseOrganiseReply('no json', cands)).toBeNull();
    expect(parseOrganiseReply('{"projects":"x"}', cands)).toBeNull();
  });

  it('same names merge, and projects that already exist are reused', () => {
    expect(mergeSameNames([{ name: 'A', fileIds: ['f1'] }, { name: 'a ', fileIds: ['f2', 'f1'] }])).toEqual([{ name: 'A', fileIds: ['f1', 'f2'] }]);
    const existing = [{ id: 'p9', name: 'Goldpaw' }] as never;
    expect(matchExisting([{ name: 'goldpaw', fileIds: ['f1'] }, { name: 'New', fileIds: ['f2'] }], existing))
      .toEqual([{ name: 'goldpaw', fileIds: ['f1'], existingId: 'p9' }, { name: 'New', fileIds: ['f2'], existingId: undefined }]);
  });
});

describe('bulk import: building', () => {
  it('makes each project once (reusing an existing one) and a script per file; same titles are named after their files', async () => {
    const calls: string[] = [];
    let n = 0;
    const client = {
      createProject: async (name: string) => { calls.push(`project ${name}`); return { id: `p${++n}`, name } as never; },
      createScript: async (pid: string, d: { title: string; content?: unknown }) => {
        calls.push(`script ${pid} ${d.title}`);
        if (d.title === 'Boom') throw new Error('disk full');
        return { meta: { id: `s${n}` }, content: null } as never;
      },
    };
    const cands = [
      cand('f1', 'Goldpaw', { name: 'Goldpaw Draft 2.fdx', metadata: { _revisionMode: true } }),
      cand('f2', 'Goldpaw', { name: 'Goldpaw Draft 5.fdx' }),
      cand('f3', 'Lighthouse'), cand('f4', 'Boom'), cand('f5', 'Bad', { error: 'unreadable' }),
    ];
    const plan = [
      { name: 'Goldpaw', fileIds: ['f1', 'f2'] },
      { name: 'Lighthouse', fileIds: ['f3', 'f4', 'f5'], existingId: 'pX' },
    ];
    const r = await buildProjects(plan, cands, client);
    expect(calls).toEqual(['project Goldpaw', 'script p1 Goldpaw Draft 2', 'script p1 Goldpaw Draft 5', 'script pX Lighthouse', 'script pX Boom']);
    expect(r.projects).toEqual([{ id: 'p1', name: 'Goldpaw', created: true, scripts: 2 }, { id: 'pX', name: 'Lighthouse', created: false, scripts: 1 }]);
    expect(r.failed).toEqual([{ name: 'Boom.fountain', error: 'disk full' }]);
  });
});

describe('bulk import: no Reformat question', () => {
  it('imported scripts are saved with the standard scene-heading spacing already chosen', async () => {
    const { importedContent } = await import('./bulkImport');
    const { predatesStandardSceneSpacing } = await import('./elementSpacing');
    const c = importedContent({ type: 'doc', content: [] }, { _revisionMode: true });
    expect(c._sceneHeadingSpaceBefore).toBeNull();
    expect(c._revisionMode).toBe(true);
    expect(predatesStandardSceneSpacing(c)).toBe(false);
    // what the old import saved — the editor asked Keep / Reformat for it
    expect(predatesStandardSceneSpacing({ type: 'doc', content: [], _revisionMode: true })).toBe(true);
  });
});

describe('bulk import: your folders, where they make sense', () => {
  it('dropping one parent folder is the same as dropping its folders', async () => {
    const { projectFolders } = await import('./bulkImport');
    const m = projectFolders([
      cand('f1', 'A', { folder: 'Scripts/Charlotte' }), cand('f2', 'B', { folder: 'Scripts/Goldpaw/old drafts' }), cand('f3', 'C', { folder: 'Scripts/Goldpaw' }),
    ]);
    expect([...m.values()]).toEqual(['Charlotte', 'Goldpaw', 'Goldpaw']);
    // one folder dropped on its own: it is the project
    expect([...projectFolders([cand('f1', 'A', { folder: 'Charlotte' }), cand('f2', 'B', { folder: 'Charlotte' })]).values()]).toEqual(['Charlotte', 'Charlotte']);
  });

  it('a folder of one script\'s drafts is a project; a folder that mixes scripts is split by title; loose files by title', async () => {
    const { planByFolderWhereSensible } = await import('./bulkImport');
    const r = planByFolderWhereSensible([
      cand('f1', 'GOLDPAW Draft 2', { folder: 'Desk/My Goldpaw' }), cand('f2', 'Goldpaw v5', { folder: 'Desk/My Goldpaw' }),
      cand('f3', 'Under The Bed', { folder: 'Desk/Misc' }), cand('f4', 'Brain Power', { folder: 'Desk/Misc' }),
      cand('f5', 'Oil On Canvas'),
    ]);
    expect(r.plan.map((p) => [p.name, p.fileIds])).toEqual([
      ['My Goldpaw', ['f1', 'f2']], ['Under The Bed', ['f3']], ['Brain Power', ['f4']], ['Oil On Canvas', ['f5']],
    ]);
    expect([r.foldersUsed, r.foldersSplit]).toEqual([1, 1]);
  });

  it('two folders of the same script, or a loose draft of a folder\'s script, become one project', async () => {
    const { planByFolderWhereSensible } = await import('./bulkImport');
    const r = planByFolderWhereSensible([
      cand('f1', 'Charlotte', { folder: 'Charlotte' }), cand('f2', 'Charlotte Screenplay', { folder: 'Charlotte Screenplay' }),
      cand('f3', 'Charlotte draft 9'),
    ]);
    expect(r.plan).toEqual([{ name: 'Charlotte', fileIds: ['f1', 'f2', 'f3'] }]);
  });
});

describe('bulk import: originals kept', () => {
  it('each imported script keeps its original file, tagged original; a failed upload never undoes the script', async () => {
    const { buildProjects } = await import('./bulkImport');
    const kept: Array<[string, string, string[] | undefined]> = [];
    const client = {
      createProject: async (name: string) => ({ id: 'p1', name }) as never,
      createScript: async () => ({ meta: { id: 's' }, content: null }) as never,
      uploadAsset: async (pid: string, f: File, tags?: string[]) => { kept.push([pid, f.name, tags]); if (f.name.startsWith('B')) throw new Error('quota'); },
    };
    const r = await buildProjects([{ name: 'X', fileIds: ['f1', 'f2'] }], [cand('f1', 'A', { name: 'A.fdx' }), cand('f2', 'B', { name: 'B.pdf', file: file('B.pdf') })], client);
    expect(kept.map((k) => [k[0], k[2]])).toEqual([['p1', ['original']], ['p1', ['original']]]);
    expect(r.projects[0].scripts).toBe(2);
    expect(r.failed).toEqual([]);
  });
});
