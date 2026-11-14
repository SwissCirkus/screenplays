/**
 * Import Script on a project page — one file or many.
 *
 * Every file goes through parseScreenplayImport exactly as a single import
 * always did (hydrateStores: false: the script lands in the project, not in
 * the open editor), and becomes one script. Files are taken in name order, so
 * "Draft 2", "Draft 3" … "Draft 10" arrive in the project list in that order.
 * A file that fails is reported and the rest still import; a PDF whose preview
 * is cancelled is skipped without a message.
 */
import type { ScriptResponse } from '../services/api';
import {
  extensionOf,
  isBinaryImportExtension,
  isImportCancelled,
  parseScreenplayImport,
  type ImportedScreenplay,
  type ParseScreenplayOptions,
} from './importScreenplay';

/** The part of `api` / `cloudApi` an import writes through. */
export interface ImportScriptClient {
  createScript: (projectId: string, data: { title: string; content?: unknown }) => Promise<ScriptResponse>;
  /** SwissCirkus: keeps the imported file itself with the project (tag 'original' → Drive's Original folder). */
  uploadAsset?: (projectId: string, file: File, tags?: string[]) => Promise<unknown>;
}

export type ParseImport = (
  filename: string,
  data: string | ArrayBuffer,
  options?: ParseScreenplayOptions,
) => Promise<ImportedScreenplay>;

export interface ImportScriptFilesResult {
  created: Array<{ id: string; title: string }>;
  failed: Array<{ name: string; error: string }>;
  /** PDFs whose import preview was cancelled. */
  skipped: number;
}

/** The title a file gets when the file itself carries none. */
export function fallbackTitle(fileName: string): string {
  return fileName.replace(/\.\w+$/, '') || 'Untitled'; // i18n-ignore: stored as the script's title
}

/** Name order, numbers compared as numbers ("Draft 2" before "Draft 10"). */
export function sortForImport<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function importScriptFiles(
  projectId: string,
  files: File[],
  client: ImportScriptClient,
  parse: ParseImport = parseScreenplayImport,
): Promise<ImportScriptFilesResult> {
  const result: ImportScriptFilesResult = { created: [], failed: [], skipped: 0 };
  for (const file of sortForImport(files)) {
    try {
      const binary = isBinaryImportExtension(extensionOf(file.name));
      const data = binary ? await file.arrayBuffer() : await file.text();
      const imported = await parse(file.name, data, { hydrateStores: false });
      const title = imported.title || fallbackTitle(file.name);
      const resp = await client.createScript(projectId, {
        title,
        // The file's revisions and scene numbering travel with it; standard scene-heading spacing is chosen up front
        // (SwissCirkus — no "Reformat?" question on every imported script).
        content: { ...(imported.doc as Record<string, unknown>), ...(imported.metadata ?? {}), _sceneHeadingSpaceBefore: null },
      });
      result.created.push({ id: resp.meta.id, title });
      if (client.uploadAsset) {
        try { await client.uploadAsset(projectId, file, ['original']); } catch (err) { console.warn('Original file not kept:', file.name, err); }
      }
    } catch (err) {
      if (isImportCancelled(err)) {
        result.skipped++;
        continue;
      }
      console.error('Failed to import script:', file.name, err);
      result.failed.push({ name: file.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
