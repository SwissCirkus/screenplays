/**
 * Bring in a pile of scripts at once — SwissCirkus fork (Christian 2026-11-14: "a box … I can just drag drop files like
 * scripts onto … either just upload them and … manually put them into folders, or … smart organize where it figures out
 * which scripts belong together and builds a project for each … so writers can take all their previous scripts, dump them
 * all there, and it organizes it all").
 *
 * 1. readCandidates: every file is parsed once (no PDF preview — headless), with what is needed to group it: its title,
 *    the title page's author and draft, the first scene heading, the main characters, and the folder it came from.
 * 2. A plan — projects, each with the files that go in it:
 *      planByFolder   — "as they are": each dropped folder becomes a project, loose files go into one project;
 *      planByTitle    — the quick guess: same script title (drafts, revisions, "copy" stripped) = same project;
 *      AI (Kontroll)  — buildOrganisePrompt / parseOrganiseReply: Kontroll's assistant reads the summaries and groups
 *                       them; its answer is checked so every file lands in exactly one project.
 * 3. buildProjects: makes the projects (an existing project of the same name is reused) and a script per file, from the
 *    already-parsed content. The browser library mirrors them to Google Drive on its own.
 */
import type { JSONContent } from '@tiptap/react';
import type { ProjectInfo, ScriptResponse } from '../services/api';
import { extensionOf, isBinaryImportExtension, isImportableExtension, parseScreenplayImport } from './importScreenplay';
import { fallbackTitle, sortForImport, type ParseImport } from './importScriptFiles';

export interface DroppedFile { file: File; /** Folder path inside what was dropped ('' for a loose file). */ folder: string }

export interface Candidate {
  id: string;
  file: File;
  name: string;
  folder: string;
  /** The script's own title (title page / format), else from the file name. */
  title: string;
  author: string;
  draft: string;
  firstScene: string;
  characters: string[];
  scenes: number;
  doc: JSONContent | null;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PlannedProject {
  name: string;
  fileIds: string[];
  /** Set when a project of this name already exists: the scripts are added to it. */
  existingId?: string;
}

// ── Collecting what was dropped (files and whole folders) ──────────────────

type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (ok: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void } };

async function walk(entry: FsEntry, folder: string, out: DroppedFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, err) => entry.file!(ok, err));
    out.push({ file, folder });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const sub = folder ? `${folder}/${entry.name}` : entry.name;
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (!batch.length) break;
      for (const e of batch) await walk(e, sub, out);
    }
  }
}

/** Files from a drop, walking into dropped folders (Chrome/Edge/Electron/Firefox/Safari all give entries). */
export async function collectDropped(dt: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const entries = Array.from(dt.items || [])
    .map((it) => (it.kind === 'file' && typeof (it as any).webkitGetAsEntry === 'function' ? (it as any).webkitGetAsEntry() as FsEntry | null : null));
  if (entries.some(Boolean)) {
    for (const e of entries) if (e) await walk(e, '', out);
  } else {
    for (const f of Array.from(dt.files || [])) out.push({ file: f, folder: '' });
  }
  return out;
}

/** Only the files the writer can import; the rest are counted. */
export function importableOnly(files: DroppedFile[]): { files: DroppedFile[]; ignored: string[] } {
  const keep: DroppedFile[] = [];
  const ignored: string[] = [];
  for (const f of files) {
    if (f.file.name.startsWith('.') || !isImportableExtension(extensionOf(f.file.name))) ignored.push(f.file.name);
    else keep.push(f);
  }
  return { files: keep, ignored };
}

// ── Reading each script once ───────────────────────────────────────────────

function text(node: JSONContent | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content || []).map(text).join('');
}

/** What grouping needs from a parsed script. */
export function summarise(doc: JSONContent | null): { author: string; draft: string; titlePageTitle: string; firstScene: string; characters: string[]; scenes: number } {
  const nodes = (doc?.content || []) as JSONContent[];
  let author = '', draft = '', titlePageTitle = '', firstScene = '', scenes = 0;
  const count = new Map<string, number>();
  for (const n of nodes) {
    const a = (n.attrs || {}) as Record<string, unknown>;
    if (n.type === 'titlePage') {
      if (typeof a.tpTitle === 'string' && a.tpTitle.trim() && !titlePageTitle) titlePageTitle = a.tpTitle.trim();
      if (typeof a.tpWrittenBy === 'string' && a.tpWrittenBy.trim() && !author) author = a.tpWrittenBy.trim();
      if (typeof a.tpDraft === 'string' && a.tpDraft.trim() && !draft) draft = a.tpDraft.trim();
    } else if (n.type === 'sceneHeading') {
      scenes += 1;
      if (!firstScene) firstScene = text(n).trim().slice(0, 80);
    } else if (n.type === 'character') {
      const name = text(n).replace(/\(.*?\)/g, '').replace(/\^$/, '').trim().toUpperCase();
      if (name && name.length <= 30) count.set(name, (count.get(name) || 0) + 1);
    }
  }
  const characters = [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n]) => n);
  return { author, draft, titlePageTitle, firstScene, characters, scenes };
}

/** Parse every file once (no PDF preview). A file that can't be read is kept, with its error, so it can be listed. */
export async function readCandidates(
  files: DroppedFile[],
  parse: ParseImport = parseScreenplayImport,
  onProgress?: (done: number, total: number) => void,
): Promise<Candidate[]> {
  const sorted = sortForImport(files.map((f) => ({ ...f, name: `${f.folder}/${f.file.name}` })));
  const out: Candidate[] = [];
  let i = 0;
  for (const f of sorted) {
    const id = `f${++i}`;
    const base: Candidate = {
      id, file: f.file, name: f.file.name, folder: f.folder, title: fallbackTitle(f.file.name),
      author: '', draft: '', firstScene: '', characters: [], scenes: 0, doc: null,
    };
    try {
      const binary = isBinaryImportExtension(extensionOf(f.file.name));
      const data = binary ? await f.file.arrayBuffer() : await f.file.text();
      const imported = await parse(f.file.name, data, { hydrateStores: false, review: false });
      const s = summarise(imported.doc);
      out.push({
        ...base, doc: imported.doc, metadata: imported.metadata,
        title: imported.title || s.titlePageTitle || base.title,
        author: s.author, draft: s.draft, firstScene: s.firstScene, characters: s.characters, scenes: s.scenes,
      });
    } catch (err) {
      out.push({ ...base, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i, sorted.length);
  }
  return out;
}

// ── Plans ──────────────────────────────────────────────────────────────────

/** A script's title with the draft / revision / date / copy marks taken off, for matching drafts of one script. */
export function scriptKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,8}$/, '')
    .replace(/[_]+/g, ' ') // "Goldpaw_v2": an underscore joins words for \b
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/\b(draft|drft|rev|revision|version|ver|v)\s*[#-]?\s*\d+([.-]\d+)*\b/g, ' ')
    .replace(/\b(final|shooting|production|white|blue|pink|yellow|green|goldenrod|buff|salmon|cherry|revised|revision|rev|draft|drft|version|ver|v|copy|backup|old|new|edit|edited|polish|pass|notes?|fdx|fountain|pdf|screenplay|script|teleplay|spec)\b\.?\s*[#-]?\s*\d*([.-]\d+)*/g, ' ')
    .replace(/\b\d{1,4}[-_./]\d{1,2}[-_./]\d{1,4}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    .replace(/[_\-–—.,:;!?'"()[\]{}]+/g, ' ')
    .replace(/\s+\d+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A project name from a script title: the draft / revision / date / copy marks off, case kept. */
export function projectNameFrom(title: string): string {
  const t = title
    .replace(/\.[a-z0-9]{2,8}$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/\b(white|blue|pink|yellow|green|goldenrod|buff|salmon|cherry)\s+(revision|rev|pages?|draft)\b/gi, ' ')
    .replace(/\b(draft|drft|rev|revision|version|ver|v)\s*[#-]?\s*\d+([.-]\d+)*\b/gi, ' ')
    .replace(/\b(final|shooting|production|revised|copy|backup)\b(\s+(draft|script))?/gi, ' ')
    .replace(/\b(screenplay|teleplay|script|spec script)\b/gi, ' ') // "Charlotte Screenplay" and "Charlotte" are one project
    .replace(/\b\d{1,4}[-_./]\d{1,2}[-_./]\d{1,4}\b/g, ' ')
    .replace(/\s+[-–—:]+\s*$/, '')
    .replace(/^\s*[-–—:]+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return prettyName(t || title);
}

function prettyName(title: string): string {
  const t = title.replace(/\.[a-z0-9]{2,8}$/i, '').trim();
  // A title in capitals (as title pages usually are) reads better in title case.
  if (t && t === t.toUpperCase()) return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return t;
}

/** "As they are": each dropped folder (its top level) becomes a project; loose files go into `looseName`. */
export function planByFolder(cands: Candidate[], looseName: string): PlannedProject[] {
  const by = new Map<string, string[]>();
  for (const c of cands) {
    if (c.error) continue;
    const top = c.folder.split('/')[0] || '';
    const name = top || looseName;
    by.set(name, [...(by.get(name) || []), c.id]);
  }
  return [...by.entries()].map(([name, fileIds]) => ({ name, fileIds }));
}

/** The quick guess: drafts of the same script (same title once draft/revision/date marks are off) = one project. */
export function planByTitle(cands: Candidate[]): PlannedProject[] {
  const groups = new Map<string, { name: string; ids: string[] }>();
  for (const c of cands) {
    if (c.error) continue;
    const key = scriptKey(c.title) || scriptKey(c.name) || c.id;
    const g = groups.get(key);
    if (g) g.ids.push(c.id);
    else groups.set(key, { name: projectNameFrom(c.title) || projectNameFrom(fallbackTitle(c.name)), ids: [c.id] });
  }
  return [...groups.values()].map((g) => ({ name: g.name, fileIds: g.ids }));
}

export const ORGANISE_SYSTEM = [
  'You sort a screenwriter\'s old script files into projects. A project is one film, episode or show: every draft,',
  'revision, polish, rewrite and copy of the same script belongs together, even when the title changed a little or the',
  'file name is messy. Different stories go into different projects. Episodes of one series go together only when the',
  'files clearly say they are the same series. Use the title, the title page (author, draft), the first scene, the main',
  'characters and the folder to decide. Name each project after the script (its best title, in normal title case — no',
  'draft numbers or dates). Every file id must appear in exactly one project. Answer with JSON only, no prose:',
  '{"projects":[{"name":"…","files":["f1","f3"],"why":"one short reason"}]}',
].join(' ');

/** The user turn for the assistant: one line per file. */
export function buildOrganisePrompt(cands: Candidate[]): string {
  const lines = cands.filter((c) => !c.error).map((c) => {
    const bits = [
      `${c.id}`, `file "${c.name}"`, c.folder ? `folder "${c.folder}"` : '', `title "${c.title}"`,
      c.author ? `by ${c.author}` : '', c.draft ? `draft "${c.draft}"` : '', c.scenes ? `${c.scenes} scenes` : '',
      c.firstScene ? `opens "${c.firstScene}"` : '', c.characters.length ? `characters ${c.characters.join(', ')}` : '',
    ].filter(Boolean);
    return '- ' + bits.join(' · ');
  });
  return `Sort these ${lines.length} files into projects:\n${lines.join('\n')}`;
}

/**
 * The assistant's answer as a plan, checked: unknown ids are dropped, a file named twice stays in its first project,
 * and any file it left out goes into the quick guess's project for it (so nothing is ever lost).
 */
export function parseOrganiseReply(reply: string, cands: Candidate[]): PlannedProject[] | null {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let data: unknown;
  try { data = JSON.parse(m[0]); } catch { return null; }
  const raw = (data as { projects?: unknown }).projects;
  if (!Array.isArray(raw)) return null;
  const valid = new Set(cands.filter((c) => !c.error).map((c) => c.id));
  const seen = new Set<string>();
  const plan: PlannedProject[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const name = String((p as { name?: unknown }).name || '').trim().slice(0, 120);
    const files = Array.isArray((p as { files?: unknown }).files) ? (p as { files: unknown[] }).files : [];
    const ids = files.map(String).filter((id) => valid.has(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (name && ids.length) plan.push({ name, fileIds: ids });
  }
  const missing = cands.filter((c) => valid.has(c.id) && !seen.has(c.id));
  if (missing.length) plan.push(...planByTitle(missing));
  return plan.length ? mergeSameNames(plan) : null;
}

/** Two planned projects with the same name (ignoring case) become one. */
export function mergeSameNames(plan: PlannedProject[]): PlannedProject[] {
  const out: PlannedProject[] = [];
  for (const p of plan) {
    const twin = out.find((q) => q.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (twin) twin.fileIds.push(...p.fileIds.filter((id) => !twin.fileIds.includes(id)));
    else out.push({ ...p, fileIds: [...p.fileIds] });
  }
  return out;
}

/** Mark the planned projects that already exist (same name): their scripts are added to them. */
export function matchExisting(plan: PlannedProject[], existing: ProjectInfo[]): PlannedProject[] {
  return plan.map((p) => {
    const hit = existing.find((e) => e.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    return hit ? { ...p, existingId: hit.id } : { ...p, existingId: undefined };
  });
}

// ── Building ───────────────────────────────────────────────────────────────

/**
 * What an imported script is saved with: the parsed document, the file's own settings, and the standard scene-heading
 * spacing already chosen — otherwise every imported script asks "Use standard scene heading spacing? Keep one line /
 * Reformat" the first time it opens (utils/elementSpacing predatesStandardSceneSpacing). `null` = follow the formatting
 * template, which is what Reformat picks (Christian 2026-11-14: "auto reformat all the scripts … so I don't have to").
 */
export function importedContent(doc: unknown, metadata?: Record<string, unknown>): Record<string, unknown> {
  return { ...(doc as Record<string, unknown>), ...(metadata ?? {}), _sceneHeadingSpaceBefore: null };
}

export interface BuildClient {
  createProject: (name: string) => Promise<ProjectInfo>;
  createScript: (projectId: string, data: { title: string; content?: unknown }) => Promise<ScriptResponse>;
}

export interface BuildResult {
  projects: Array<{ id: string; name: string; created: boolean; scripts: number }>;
  failed: Array<{ name: string; error: string }>;
}

/** Make the projects and their scripts. Scripts that share a title in one project are named after their files. */
export async function buildProjects(
  plan: PlannedProject[],
  cands: Candidate[],
  client: BuildClient,
  onProgress?: (done: number, total: number) => void,
): Promise<BuildResult> {
  const byId = new Map(cands.map((c) => [c.id, c]));
  const result: BuildResult = { projects: [], failed: [] };
  const total = plan.reduce((n, p) => n + p.fileIds.length, 0);
  let done = 0;
  for (const p of plan) {
    const files = p.fileIds.map((id) => byId.get(id)).filter((c): c is Candidate => !!c && !c.error && !!c.doc);
    if (!files.length) continue;
    let projectId = p.existingId;
    let created = false;
    try {
      if (!projectId) { projectId = (await client.createProject(p.name)).id; created = true; }
    } catch (err) {
      for (const c of files) result.failed.push({ name: c.name, error: err instanceof Error ? err.message : String(err) });
      done += files.length; onProgress?.(done, total);
      continue;
    }
    const titleCount = new Map<string, number>();
    for (const c of files) titleCount.set(c.title.toLowerCase(), (titleCount.get(c.title.toLowerCase()) || 0) + 1);
    let made = 0;
    for (const c of files) {
      const title = (titleCount.get(c.title.toLowerCase()) || 0) > 1 ? fallbackTitle(c.name) : c.title;
      try {
        await client.createScript(projectId, { title, content: importedContent(c.doc, c.metadata) });
        made += 1;
      } catch (err) {
        result.failed.push({ name: c.name, error: err instanceof Error ? err.message : String(err) });
      }
      done += 1; onProgress?.(done, total);
    }
    result.projects.push({ id: projectId, name: p.name, created, scripts: made });
  }
  return result;
}
