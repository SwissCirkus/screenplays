import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV_MAX, NAV_MIN, clampPanelWidth, loadPanelWidth, savePanelWidth } from './panelWidths';
import { panelResize } from './panelResize';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('side-panel widths are kept as the writer leaves them', () => {
  it('saves and loads each side, clamped to its limits', () => {
    const s = memoryStore();
    expect(loadPanelWidth('left', s)).toBeNull();
    savePanelWidth('left', 455.4, s);
    savePanelWidth('right', 9999, s);
    expect(loadPanelWidth('left', s)).toBe(455);
    expect(loadPanelWidth('right', s)).toBe(600);
    s.setItem('swisscirkus:navigator-width', 'junk');
    expect(loadPanelWidth('left', s)).toBeNull();
    expect(clampPanelWidth('left', 10)).toBe(NAV_MIN);
    expect(clampPanelWidth('left', 2000)).toBe(NAV_MAX);
  });

  it('a storage that throws (private mode) never breaks the editor', () => {
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(loadPanelWidth('left', bad)).toBeNull();
    expect(() => savePanelWidth('left', 300, bad)).not.toThrow();
  });

  it('the keyboard resize reaches the wider Navigator limit', () => {
    expect(panelResize(300, 'End', 'left')).toBe(NAV_MAX);
    expect(panelResize(NAV_MAX, 'ArrowRight', 'left')).toBe(NAV_MAX);
  });
});

describe('the editor uses the kept widths', () => {
  const ed = src('../components/ScreenplayEditor.tsx');
  it('starts from the saved width, and saves what the writer drags or keys', () => {
    expect(ed).toMatch(/useState\(\(\) => loadPanelWidth\('left'\) \?\? NAV_FALLBACK\)/);
    expect(ed).toMatch(/useState\(\(\) => loadPanelWidth\('right'\) \?\? 300\)/);
    expect(ed).toMatch(/setNavWidth\(w\);\s*savePanelWidth\('left', w\);/);
    expect(ed).toMatch(/setNavWidth\(next\); savePanelWidth\('left', next\);/);
    expect(ed).toMatch(/savePanelWidth\('right', w\)/);
  });
  it('a Navigator never resized opens wide enough for every tab, measured once per opening', () => {
    expect(ed).toMatch(/if \(navAutoFitted\.current \|\| navWidthSetByWriter\.current \|\| foldOpen\) return;/);
    expect(ed).toMatch(/navigatorWidthForAllTabs\(document\.querySelector\('\.scene-navigator'\)\)/);
    expect(ed).toMatch(/if \(fit > navWidth\) setNavWidth\(fit\);/);
    expect(src('./panelWidths.ts')).toMatch(/strip\.style\.width = 'max-content';/);
  });
});
