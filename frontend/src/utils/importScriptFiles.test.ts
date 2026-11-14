import { describe, it, expect } from 'vitest';
import { importScriptFiles, sortForImport, fallbackTitle, type ImportScriptClient, type ParseImport } from './importScriptFiles';
import { ImportCancelledError } from './pdfImportReview';

function fakeClient() {
  const created: Array<{ projectId: string; title: string; content: Record<string, unknown> }> = [];
  const client: ImportScriptClient = {
    createScript: async (projectId, data) => {
      created.push({ projectId, title: data.title, content: data.content as Record<string, unknown> });
      return { meta: { id: `s${created.length}`, title: data.title } } as never;
    },
  };
  return { client, created };
}

const doc = { type: 'doc', content: [{ type: 'sceneHeading', content: [{ type: 'text', text: 'INT. LAB - NIGHT' }] }] };

describe('importScriptFiles', () => {
  it('imports every file as its own script, in name order, with numbers compared as numbers', async () => {
    const { client, created } = fakeClient();
    const seen: Array<{ name: string; hydrate: unknown; kind: string }> = [];
    const parse: ParseImport = async (name, data, options) => {
      seen.push({ name, hydrate: options?.hydrateStores, kind: typeof data });
      return { doc, title: '', formatLabel: 'x', warnings: [], metadata: { _sceneNumbersLocked: true } };
    };
    const files = [
      new File(['INT. A - DAY'], 'Goldpaw - Draft 10.fountain'),
      new File(['<FinalDraft/>'], 'Goldpaw - Draft 2.fdx'),
      new File([new Uint8Array([80, 75])], 'Under the Bed - v004.celtx'),
    ];
    const result = await importScriptFiles('p1', files, client, parse);

    expect(result.failed).toEqual([]);
    expect(created.map((c) => c.title)).toEqual(['Goldpaw - Draft 2', 'Goldpaw - Draft 10', 'Under the Bed - v004']);
    expect(created.every((c) => c.projectId === 'p1')).toBe(true);
    // Never touches the open editor's stores.
    expect(seen.every((s) => s.hydrate === false)).toBe(true);
    // Text formats read as text, archive formats as bytes.
    expect(seen.map((s) => s.kind)).toEqual(['string', 'string', 'object']);
    // The file's settings travel with the text, as a single import did.
    expect(created[0].content).toMatchObject({ type: 'doc', _sceneNumbersLocked: true });
    expect(result.created.map((c) => c.id)).toEqual(['s1', 's2', 's3']);
  });

  it('keeps a title the file carries itself', async () => {
    const { client, created } = fakeClient();
    const parse: ParseImport = async () => ({ doc, title: 'Under the Bed', formatLabel: 'x', warnings: [] });
    await importScriptFiles('p1', [new File([new Uint8Array([1])], 'project.celtx')], client, parse);
    expect(created[0].title).toBe('Under the Bed');
  });

  it('reports a file that fails and still imports the rest', async () => {
    const { client, created } = fakeClient();
    const parse: ParseImport = async (name) => {
      if (name.startsWith('Broken')) throw new Error('not a screenplay');
      return { doc, title: '', formatLabel: 'x', warnings: [] };
    };
    const result = await importScriptFiles('p1', [new File(['x'], 'Broken.fdx'), new File(['y'], 'Good.fountain')], client, parse);
    expect(created.map((c) => c.title)).toEqual(['Good']);
    expect(result.failed).toEqual([{ name: 'Broken.fdx', error: 'not a screenplay' }]);
  });

  it('skips a PDF whose preview was cancelled, without calling it a failure', async () => {
    const { client, created } = fakeClient();
    const parse: ParseImport = async () => { throw new ImportCancelledError(); };
    const result = await importScriptFiles('p1', [new File([new Uint8Array([37])], 'Draft.pdf')], client, parse);
    expect(created).toEqual([]);
    expect(result).toMatchObject({ failed: [], skipped: 1 });
  });
});

describe('helpers', () => {
  it('sorts names naturally and falls back to the file name for a title', () => {
    expect(sortForImport([{ name: 'v10' }, { name: 'v9' }, { name: 'V1' }]).map((f) => f.name)).toEqual(['V1', 'v9', 'v10']);
    expect(fallbackTitle('Goldpaw - Draft 5I (Celtx).fountain')).toBe('Goldpaw - Draft 5I (Celtx)');
    expect(fallbackTitle('.fdx')).toBe('Untitled');
  });
});
