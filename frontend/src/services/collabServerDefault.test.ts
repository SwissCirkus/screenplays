import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultCollabUrl, storedCollabUrl } from '../stores/settingsStore';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const OURS = 'https://screenplays-cowrite-137075271992.us-central1.run.app';

// Christian 2026-11-16: "I couldn't reach the collaboration server" — Collaborate checked OpenDraft's public server (which answers
// our site with an error), not ours; and the copied invite links pointed at a server page that doesn't exist.
describe('the co-writing server the writer checks and links to', () => {
  it('is our own server when the build has one; OpenDraft\'s otherwise', () => {
    expect(defaultCollabUrl(OURS)).toBe('wss://screenplays-cowrite-137075271992.us-central1.run.app');
    expect(defaultCollabUrl('')).toMatch(/^wss:\/\//);
  });

  it('an address saved while OpenDraft\'s was the default moves to ours; one you typed yourself stays', () => {
    expect(storedCollabUrl('wss://collab.open-draft.com', OURS)).toBe('wss://screenplays-cowrite-137075271992.us-central1.run.app');
    expect(storedCollabUrl('wss://collab.open-draft.com/', OURS)).toBe('wss://screenplays-cowrite-137075271992.us-central1.run.app');
    expect(storedCollabUrl(null, OURS)).toBe('wss://screenplays-cowrite-137075271992.us-central1.run.app');
    expect(storedCollabUrl('wss://my.own.server', OURS)).toBe('wss://my.own.server');
    expect(storedCollabUrl('wss://collab.open-draft.com', '')).toBe('wss://collab.open-draft.com');
    const cfg = src('../config.ts');
    expect(cfg.includes("if (stored && !(server && stored.replace(/\\/+$/, '') === DEFAULT_COLLAB_WS)) return stored;")).toBe(true);
  });

  it('invite links open the writer itself (its /collab/<token> page), not the server', () => {
    const d = src('../components/ShareDialog.tsx');
    expect(d.includes("if (collabServerHttp()) return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\\/$/, '')}/collab/${token}`;")).toBe(true);
    expect(src('../App.tsx').includes('<Route path="/collab/:collabToken" element={<ScreenplayEditor />} />')).toBe(true);
    expect(src('../../../publish-pages.sh').includes('cp "$OUT/index.html" "$OUT/404.html"')).toBe(true);
  });
});
