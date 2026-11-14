/**
 * The Script Assistant's Google Docs actions (SwissCirkus fork, Christian 2026-11-15). The model asks for them in its JSON
 * reply ("docs":[…]); the panel runs searches and reads by itself and asks again with what it found (a few rounds at most),
 * and lists every change to a Doc for the writer to Apply. Model-facing text is never shown or translated.
 */
// i18n-ignore-start model-facing prompt text and parsing

export type DocAction =
  | { do: 'search'; query: string }
  | { do: 'read'; id: string }
  | { do: 'create'; title: string; text: string }
  | { do: 'append'; id: string; name?: string; text: string }
  | { do: 'replace'; id: string; name?: string; text: string };

export type DocWrite = Extract<DocAction, { do: 'create' | 'append' | 'replace' }>;

export const MAX_DOC_ROUNDS = 4;

export const DOCS_ON_PROMPT = [
  '',
  'GOOGLE DOCS: you can reach ALL of the writer\'s Google Docs. Add a "docs" list to your JSON to use them:',
  '- {"do":"search","query":"<words>"}  (finds Docs by name or text; "" lists the most recently changed)',
  '- {"do":"read","id":"<doc id from a search, or a Doc link>"}',
  '- {"do":"create","title":"<title>","text":"<plain text>"}',
  '- {"do":"append","id":"<doc id>","name":"<doc name>","text":"<plain text to add at the end>"}',
  '- {"do":"replace","id":"<doc id>","name":"<doc name>","text":"<the Doc\'s whole new text>"}  (only when asked to rewrite a Doc)',
  'Searches and reads run at once and come back to you as GOOGLE DOCS RESULTS, then you answer again with the same JSON.',
  'Search or read only what the request needs; never invent a Doc id. Changes to Docs (create/append/replace) are shown to the',
  'writer, who applies them; say in "reply" what each one does. To look things up, reply with only searches/reads and edits: [].',
].join('\n');

export const DOCS_OFF_PROMPT = [
  '',
  'GOOGLE DOCS: access to the writer\'s Google Docs is NOT set up yet. If they ask to find, read, open, search or write their',
  'Google Docs (other than documents attached below), explain in "reply" that the Script Assistant needs a one-time setup:',
  'press the "Set up Google Docs access" button shown under your reply, then allow access in the Google window that opens',
  '(Google may say it hasn\'t verified the app: choose Advanced, then continue). After that you can search, read and,',
  'when they press Apply, write their Docs. Add "setup": true to your JSON so the button appears.',
].join('\n');

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The Docs actions in a reply, and whether it asks for the setup button. Bad entries are dropped. */
export function parseDocActions(text: string): { actions: DocAction[]; setup: boolean } {
  const raw = text.replace(/```(?:json)?/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { actions: [], setup: false };
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return { actions: [], setup: false }; }
  const actions: DocAction[] = [];
  for (const a of Array.isArray(obj.docs) ? obj.docs : []) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const kind = str(o.do || o.op);
    if (kind === 'search') actions.push({ do: 'search', query: str(o.query) });
    else if (kind === 'read' && str(o.id)) actions.push({ do: 'read', id: str(o.id) });
    else if (kind === 'create' && str(o.text)) actions.push({ do: 'create', title: str(o.title) || 'Untitled', text: str(o.text) });
    else if ((kind === 'append' || kind === 'replace') && str(o.id) && str(o.text)) {
      actions.push({ do: kind, id: str(o.id), name: str(o.name) || undefined, text: str(o.text) });
    }
  }
  return { actions, setup: obj.setup === true };
}

export const isLookup = (a: DocAction): a is Extract<DocAction, { do: 'search' | 'read' }> => a.do === 'search' || a.do === 'read';
export const isWrite = (a: DocAction): a is DocWrite => !isLookup(a);

/** What a lookup found, as the model reads it next round. */
export function lookupResult(a: DocAction, outcome: { hits?: { id: string; name: string; modified: string }[]; doc?: { id: string; name: string; text: string; cut: boolean }; error?: string }): string {
  if (outcome.error) return a.do === 'search' ? `SEARCH "${(a as { query: string }).query}": failed (${outcome.error})` : `READ ${(a as { id: string }).id}: failed (${outcome.error})`;
  if (a.do === 'search') {
    const hits = outcome.hits ?? [];
    if (!hits.length) return `SEARCH "${a.query}": no Google Docs found.`;
    return [`SEARCH "${a.query}":`, ...hits.map((h) => `- id ${h.id} · "${h.name}"${h.modified ? ` · changed ${h.modified.slice(0, 10)}` : ''}`)].join('\n');
  }
  const d = outcome.doc!;
  return [`READ "${d.name}" (id ${d.id})${d.cut ? ' — only the first part, it is long' : ''}:`, d.text.trim() || '(empty)'].join('\n');
}
// i18n-ignore-end
