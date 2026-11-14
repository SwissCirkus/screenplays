import { describe, it, expect } from 'vitest';
import type { JSONContent } from '@tiptap/react';
import { parseFountain } from '../../utils/fountainParser';
import {
  applyOrder, fountainToNodes, parseAssistantReply, planEdits, sceneSignature, scriptForModel, scriptLayout,
  type PlannedEdit,
} from './scriptEdits';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

// A real document, as the editor holds it: parsed from Fountain by the app's own importer.
const SCRIPT = `Title: The Door
Author: C.

A quiet street.

INT. KITCHEN - DAY

Ada pours coffee.

ADA
The door was open.

EXT. GARDEN - NIGHT

Bo waits by the gate.

BO
(whispering)
Close it.

INT. HALL - LATER

Silence.
`;
const doc = (): JSONContent => parseFountain(SCRIPT) as JSONContent;
const types = (nodes: JSONContent[]) => nodes.map((n) => n.type);
const textOf = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

/** Apply a plan to the top-level content the way the panel does to the editor: back to front. */
function applyToJson(d: JSONContent, planned: PlannedEdit[]): JSONContent[] {
  const content = [...(d.content ?? [])];
  for (const p of applyOrder(planned)) content.splice(p.start, p.end - p.start, ...p.content);
  return content;
}

describe('the script as the model reads it', () => {
  it('numbers the scenes and keeps what comes before the first one apart', () => {
    const d = doc();
    const layout = scriptLayout(d);
    expect(layout.scenes.map((s) => s.heading)).toEqual(['INT. KITCHEN - DAY', 'EXT. GARDEN - NIGHT', 'INT. HALL - LATER']);
    expect(d.content?.[0].type).toBe('titlePage');
    const text = scriptForModel(d);
    expect(text).toMatch(/^=== BEFORE SCENE 1 ===\nA quiet street\./);
    expect(text).toContain('=== SCENE 1 ===\nINT. KITCHEN - DAY');
    expect(text).toContain('=== SCENE 2 ===\nEXT. GARDEN - NIGHT');
    expect(text).toContain('BO\n(whispering)\nClose it.');
    expect(text).not.toContain('Title:');
  });

  it('says so when the script is empty', () => {
    expect(scriptForModel({ type: 'doc', content: [] })).toBe('(The script is empty.)');
  });
});

describe('reading the answer', () => {
  it('reads the JSON object, code fences and all', () => {
    const r = parseAssistantReply('```json\n{"reply":"Done.","edits":[{"op":"replaceScene","scene":"2","fountain":"EXT. GARDEN - DAY\\n\\nSun."},{"op":"bogus"}]}\n```');
    expect(r.parsed).toBe(true);
    expect(r.reply).toBe('Done.');
    expect(r.edits).toEqual([{ op: 'replaceScene', scene: 2, fountain: 'EXT. GARDEN - DAY\n\nSun.' }]);
  });
  it('shows prose as a plain reply with no edits', () => {
    expect(parseAssistantReply('Scene 2 is the weakest.')).toEqual({ reply: 'Scene 2 is the weakest.', edits: [], parsed: false });
  });
});

describe('Fountain from the model becomes editor elements', () => {
  it('drops copied scene markers and any title page', () => {
    const nodes = fountainToNodes('=== SCENE 2 ===\nTitle: X\n\nEXT. GARDEN - DAY\n\nSun.\n\nBO\nHi.');
    expect(types(nodes)).toEqual(['sceneHeading', 'action', 'character', 'dialogue']);
  });
});

describe('planning edits', () => {
  const where = { selection: null, cursor: null };

  it('rewrites one scene and leaves the others exactly as they were', () => {
    const d = doc();
    const { planned, problems } = planEdits(d, [{ op: 'replaceScene', scene: 2, fountain: 'EXT. GARDEN - DAWN\n\nBo opens the gate.' }], where);
    expect(problems).toEqual([]);
    const out = applyToJson(d, planned);
    const after = scriptLayout({ type: 'doc', content: out });
    expect(after.scenes.map((s) => s.heading)).toEqual(['INT. KITCHEN - DAY', 'EXT. GARDEN - DAWN', 'INT. HALL - LATER']);
    expect(out.map(textOf)).toContain('Bo opens the gate.');
    expect(out.map(textOf)).not.toContain('Close it.');
    expect(out.map(textOf)).toContain('The door was open.');
  });

  it('inserts after a scene, before the first one (scene 0), deletes, and replaces everything but the title page', () => {
    const d = doc();
    const ins = applyToJson(d, planEdits(d, [
      { op: 'insertAfterScene', scene: 3, fountain: 'EXT. ROOF - NIGHT\n\nWind.' },
      { op: 'insertAfterScene', scene: 0, fountain: 'EXT. CITY - DAWN\n\nTraffic.' },
      { op: 'deleteScene', scene: 1 },
    ], where).planned);
    expect(scriptLayout({ type: 'doc', content: ins }).scenes.map((s) => s.heading))
      .toEqual(['EXT. CITY - DAWN', 'EXT. GARDEN - NIGHT', 'INT. HALL - LATER', 'EXT. ROOF - NIGHT']);
    expect(ins.map(textOf)).toContain('A quiet street.');

    const all = applyToJson(d, planEdits(d, [{ op: 'replaceScript', fountain: 'INT. NEW - DAY\n\nNew.' }], where).planned);
    expect(types(all)[0]).toBe('titlePage');
    expect(all.filter((n) => n.type !== 'titlePage').map(textOf)).toEqual(['INT. NEW - DAY', 'New.']);
  });

  it('keeps several inserts at one place in the order the model gave them', () => {
    const d = doc();
    const out = applyToJson(d, planEdits(d, [
      { op: 'insertAfterScene', scene: 1, fountain: 'INT. A - DAY\n\nOne.' },
      { op: 'insertAfterScene', scene: 1, fountain: 'INT. B - DAY\n\nTwo.' },
    ], where).planned);
    expect(scriptLayout({ type: 'doc', content: out }).scenes.map((s) => s.heading).slice(0, 4))
      .toEqual(['INT. KITCHEN - DAY', 'INT. A - DAY', 'INT. B - DAY', 'EXT. GARDEN - NIGHT']);
  });

  it('refuses unknown scenes, empty rewrites, two edits on one scene, and a selection edit with nothing selected', () => {
    const d = doc();
    const { planned, problems } = planEdits(d, [
      { op: 'replaceScene', scene: 9, fountain: 'INT. X - DAY' },
      { op: 'replaceScene', scene: 1, fountain: '   ' },
      { op: 'replaceScene', scene: 2, fountain: 'EXT. GARDEN - DAY\n\nA.' },
      { op: 'deleteScene', scene: 2 },
      { op: 'replaceSelection', fountain: 'Hi.' },
    ], where);
    expect(planned).toHaveLength(1);
    expect(problems).toEqual([
      'replaceScene: there is no scene 9',
      'replaceScene: no text',
      'replaceSelection: nothing is selected',
      'deleteScene 2: overlaps another change',
    ]);
  });

  it('replaces the selected elements and inserts at the cursor', () => {
    const d = doc();
    const layout = scriptLayout(d);
    const s1 = layout.scenes[0];
    const out = applyToJson(d, planEdits(d, [
      { op: 'replaceSelection', fountain: 'Ada pours tea.' },
      { op: 'insertAtCursor', fountain: 'Rain starts.' },
    ], { selection: { start: s1.start + 1, end: s1.start + 2 }, cursor: layout.scenes[2].start + 1 }).planned);
    const texts = out.map(textOf);
    expect(texts).toContain('Ada pours tea.');
    expect(texts).not.toContain('Ada pours coffee.');
    expect(texts.indexOf('Rain starts.')).toBe(texts.indexOf('INT. HALL - LATER') + 1);
  });

  it('notices when the script changed shape since the question', () => {
    const d = doc();
    const changed = applyToJson(d, planEdits(d, [{ op: 'deleteScene', scene: 3 }], { selection: null, cursor: null }).planned);
    expect(sceneSignature(d)).not.toBe(sceneSignature({ type: 'doc', content: changed }));
  });
});

describe('what the model is told', () => {
  it('asks for one JSON object with the edit ops the planner understands', () => {
    for (const op of ['replaceScene', 'insertAfterScene', 'deleteScene', 'replaceSelection', 'insertAtCursor', 'replaceScript']) {
      expect(SYSTEM_PROMPT).toContain(`"op":"${op}"`);
    }
  });
  it('puts the attached Docs, the cursor and the selection in the request', () => {
    const u = buildUserPrompt({
      request: 'Apply my notes', script: '=== SCENE 1 ===\nINT. A - DAY',
      docs: [{ name: 'Notes', url: 'https://docs.google.com/document/d/x/edit', text: 'Cut scene 1.' }],
      history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], cursorScene: 1, selection: 'INT. A - DAY',
    });
    expect(u).toContain('ATTACHED DOCUMENT "Notes"');
    expect(u).toContain('Cut scene 1.');
    expect(u).toContain('cursor is in scene 1');
    expect(u).toContain('SELECTED TEXT');
    expect(u.indexOf('EARLIER IN THIS CONVERSATION')).toBeLessThan(u.indexOf('SCREENPLAY:'));
    expect(u.trim().endsWith('Apply my notes')).toBe(true);
  });
});
