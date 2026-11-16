import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Christian 2026-11-16: "when I invite somebody … make a copy immediately in the project of that script … and add the collab behind
// the script name" — and you write in that copy, so the original stays as it was.
describe('collaborate on a "(collab)" copy', () => {
  const ed = src('../components/ScreenplayEditor.tsx');
  const fn = ed.slice(ed.indexOf('const makeCollabCopy = useCallback'), ed.indexOf('const handleDocumentSaved'));
  it('saves the original, makes "<title> (collab)" from what is on screen, switches to it', () => {
    expect(fn.includes('await api.saveScript(pid, sid, { content });')).toBe(true);
    expect(fn.includes('await api.createScript(pid, { title: `${title} (collab)`, content, format });')).toBe(true);
    expect(fn.includes('setCurrentScriptId(made.meta.id);')).toBe(true);
    expect(fn.includes("window.dispatchEvent(new CustomEvent('screenplays:library-changed'));")).toBe(true);
    expect(fn.includes('return sid;')).toBe(true); // already a collab copy: no second one
  });
  it('only on the first invite of a new session, and the session runs on the copy', () => {
    const d = src('../components/ShareDialog.tsx');
    expect(d.includes('if (!isCollabActive && sessions.length === 0 && onMakeCopy) {')).toBe(true);
    expect(d.includes('const session = await api.createCollabInvite(projectId, sid, trimmed, role, expiryHours, existingNonce);')).toBe(true);
    expect(d.includes('onStartCollab(session, sid);')).toBe(true);
    expect(ed.includes('onMakeCopy={makeCollabCopy}')).toBe(true);
    expect(ed.includes('const currentScriptId = scriptIdOverride || useProjectStore.getState().currentScriptId;')).toBe(true);
  });
});
