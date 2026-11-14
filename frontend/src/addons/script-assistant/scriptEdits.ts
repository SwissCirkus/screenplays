/**
 * What the Script Assistant shows the model, and how its answer becomes edits.
 *
 * The script goes to the model as Fountain, cut into numbered scenes:
 *
 *   === BEFORE SCENE 1 ===   (anything above the first scene heading)
 *   === SCENE 1 ===
 *   INT. KITCHEN - DAY
 *   ...
 *
 * The model answers with one JSON object — a short reply to the writer and
 * a list of edits by scene number:
 *
 *   {"reply":"...","edits":[{"op":"replaceScene","scene":3,"fountain":"..."}]}
 *
 * Nothing here touches the editor: edits are planned against the document's
 * top-level elements (by index), and the panel turns that plan into one
 * editor transaction, so one undo takes it all back.
 */
import type { JSONContent } from '@tiptap/react';
import { exportFountain } from '../../utils/fountainExporter';
import { parseFountain } from '../../utils/fountainParser';

export type EditOp =
  | 'replaceScene' | 'insertAfterScene' | 'deleteScene'
  | 'replaceSelection' | 'insertAtCursor' | 'replaceScript';

export interface AssistantEdit {
  op: EditOp;
  /** Scene number (1-based) for the scene ops; 0 = before the first scene for insertAfterScene. */
  scene?: number;
  /** New text, in Fountain. Not used by deleteScene. */
  fountain?: string;
}

export interface AssistantReply { reply: string; edits: AssistantEdit[]; parsed: boolean }

export interface SceneSpan {
  /** 1-based scene number. */
  number: number;
  heading: string;
  /** Index of the scene heading in the document's top-level content. */
  start: number;
  /** One past the scene's last top-level element. */
  end: number;
}

export interface ScriptLayout {
  /** Top-level elements before the first scene heading, after any title page: [start, end). */
  preamble: { start: number; end: number };
  scenes: SceneSpan[];
  /** Top-level element count. */
  size: number;
  /** Where the body starts (after title-page elements). */
  bodyStart: number;
}

/** One planned change, in top-level element indices: replace [start, end) with `content`. */
export interface PlannedEdit {
  edit: AssistantEdit;
  start: number;
  end: number;
  content: JSONContent[];
}

const TITLE_TYPES = new Set(['titlePage']);

function nodeText(node: JSONContent): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(nodeText).join('');
}

/** Scene spans of a document (its JSON). */
export function scriptLayout(doc: JSONContent): ScriptLayout {
  const content = doc.content ?? [];
  let bodyStart = 0;
  while (bodyStart < content.length && TITLE_TYPES.has(content[bodyStart].type ?? '')) bodyStart++;
  const scenes: SceneSpan[] = [];
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i].type !== 'sceneHeading') continue;
    if (scenes.length) scenes[scenes.length - 1].end = i;
    scenes.push({ number: scenes.length + 1, heading: nodeText(content[i]).trim(), start: i, end: content.length });
  }
  const firstScene = scenes.length ? scenes[0].start : content.length;
  return { preamble: { start: bodyStart, end: firstScene }, scenes, size: content.length, bodyStart };
}

function fountainOf(nodes: JSONContent[]): string {
  if (nodes.length === 0) return '';
  return exportFountain({ type: 'doc', content: nodes }).trim();
}

/** The script as the model reads it: Fountain with numbered scene markers. */
export function scriptForModel(doc: JSONContent): string {
  const content = doc.content ?? [];
  const layout = scriptLayout(doc);
  const parts: string[] = [];
  const before = fountainOf(content.slice(layout.preamble.start, layout.preamble.end));
  if (before) parts.push('=== BEFORE SCENE 1 ===', before, '');
  for (const s of layout.scenes) {
    parts.push(`=== SCENE ${s.number} ===`, fountainOf(content.slice(s.start, s.end)), '');
  }
  if (parts.length === 0) return '(The script is empty.)';
  return parts.join('\n').trim();
}

/** Fountain text → editor elements. Scene markers the model may have copied are dropped, and so is any title page. */
export function fountainToNodes(text: string): JSONContent[] {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*===\s*(?:BEFORE\s+)?SCENE\s+\d+\s*===\s*$/i.test(line))
    .join('\n')
    .trim();
  if (!cleaned) return [];
  const doc = parseFountain(cleaned) as JSONContent;
  return (doc.content ?? []).filter((n) => !TITLE_TYPES.has(n.type ?? ''));
}

const OPS: ReadonlySet<string> = new Set([
  'replaceScene', 'insertAfterScene', 'deleteScene', 'replaceSelection', 'insertAtCursor', 'replaceScript',
]);

function asEdit(raw: unknown): AssistantEdit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const op = typeof r.op === 'string' ? r.op : '';
  if (!OPS.has(op)) return null;
  const scene = typeof r.scene === 'number' ? r.scene : typeof r.scene === 'string' && /^\d+$/.test(r.scene) ? Number(r.scene) : undefined;
  const fountain = typeof r.fountain === 'string' ? r.fountain : typeof r.text === 'string' ? r.text : undefined;
  const edit: AssistantEdit = { op: op as EditOp };
  if (scene !== undefined) edit.scene = scene;
  if (fountain !== undefined) edit.fountain = fountain;
  return edit;
}

/**
 * Read the model's answer. A JSON object (code fences tolerated) gives the
 * reply and the edits; anything else is shown as a plain reply with no edits.
 */
export function parseAssistantReply(text: string): AssistantReply {
  const raw = text.replace(/```(?:json)?/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const edits = (Array.isArray(obj.edits) ? obj.edits : []).map(asEdit).filter((e): e is AssistantEdit => e !== null);
      const reply = typeof obj.reply === 'string' ? obj.reply : typeof obj.message === 'string' ? obj.message : '';
      return { reply: reply.trim(), edits, parsed: true };
    } catch {
      // not JSON after all — fall through to prose
    }
  }
  return { reply: text.trim(), edits: [], parsed: false };
}

/** The selection, as top-level element indices [start, end), or null when there is none. */
export interface BlockRange { start: number; end: number }

export interface PlanResult { planned: PlannedEdit[]; problems: string[] }

/**
 * Turn edits into planned replacements. Each problem names the edit it
 * refused (an unknown scene, two edits on one scene, an empty rewrite…), so
 * the panel can say what it left out instead of guessing.
 */
export function planEdits(
  doc: JSONContent,
  edits: AssistantEdit[],
  where: { selection: BlockRange | null; cursor: number | null },
): PlanResult {
  const layout = scriptLayout(doc);
  const planned: PlannedEdit[] = [];
  const problems: string[] = [];
  const scene = (n: number | undefined) => (n === undefined ? undefined : layout.scenes.find((s) => s.number === n));

  for (const edit of edits) {
    const content = edit.op === 'deleteScene' ? [] : fountainToNodes(edit.fountain ?? '');
    if (edit.op !== 'deleteScene' && content.length === 0) { problems.push(`${edit.op}: no text`); continue; }
    switch (edit.op) {
      case 'replaceScene':
      case 'deleteScene': {
        const s = scene(edit.scene);
        if (!s) { problems.push(`${edit.op}: there is no scene ${edit.scene ?? '?'}`); continue; }
        planned.push({ edit, start: s.start, end: s.end, content });
        break;
      }
      case 'insertAfterScene': {
        if (edit.scene === 0) { planned.push({ edit, start: layout.preamble.end, end: layout.preamble.end, content }); break; }
        const s = scene(edit.scene);
        if (!s) { problems.push(`insertAfterScene: there is no scene ${edit.scene ?? '?'}`); continue; }
        planned.push({ edit, start: s.end, end: s.end, content });
        break;
      }
      case 'replaceSelection': {
        if (!where.selection) { problems.push('replaceSelection: nothing is selected'); continue; }
        planned.push({ edit, start: where.selection.start, end: where.selection.end, content });
        break;
      }
      case 'insertAtCursor': {
        const at = where.cursor ?? layout.size;
        planned.push({ edit, start: at, end: at, content });
        break;
      }
      case 'replaceScript':
        planned.push({ edit, start: layout.bodyStart, end: layout.size, content });
        break;
    }
  }

  // Two changes over the same elements can't both be right: keep the first, refuse the rest.
  const kept: PlannedEdit[] = [];
  for (const p of planned) {
    const clash = kept.some((k) => (p.start < k.end && k.start < p.end)
      || (p.start === p.end && k.start < p.start && p.start < k.end)
      || (k.start === k.end && p.start < k.start && k.start < p.end));
    if (clash) problems.push(`${p.edit.op}${p.edit.scene !== undefined ? ` ${p.edit.scene}` : ''}: overlaps another change`);
    else kept.push(p);
  }
  return { planned: kept, problems };
}

/**
 * Order to apply planned edits in: from the end of the script backwards, so
 * each change leaves the positions of the ones still to come untouched.
 * Inserts at the same spot keep the order the model gave them.
 */
export function applyOrder(planned: PlannedEdit[]): PlannedEdit[] {
  return planned
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.start - a.p.start || b.p.end - a.p.end || b.i - a.i)
    .map(({ p }) => p);
}

/** Scene headings, to tell whether the script changed shape since the question was asked. */
export function sceneSignature(doc: JSONContent): string {
  return scriptLayout(doc).scenes.map((s) => s.heading).join('\n');
}

/** Short preview text for an edit: its first lines of Fountain. */
export function editPreview(edit: AssistantEdit, maxLines = 14): string {
  const lines = (edit.fountain ?? '').replace(/\r\n?/g, '\n').trim().split('\n');
  return lines.length > maxLines ? `${lines.slice(0, maxLines).join('\n')}\n…` : lines.join('\n');
}
