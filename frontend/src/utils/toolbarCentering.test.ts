import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolbarLeadPadding } from './toolbarCentering';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('toolbarLeadPadding: centre the toolbar over the page', () => {
  it('centres the buttons over the page middle when there is room', () => {
    // 1600px bar, Navigator open so the page middle sits right of the window middle.
    const lead = toolbarLeadPadding({ toolbarWidth: 1600, basePad: 8, contentWidth: 700, targetCenter: 920 });
    expect(lead).toBe(570); // 920 - 700/2
    expect(lead + 700 / 2).toBe(920);
  });

  it('never pushes the buttons off the right edge', () => {
    const lead = toolbarLeadPadding({ toolbarWidth: 1000, basePad: 8, contentWidth: 700, targetCenter: 900 });
    expect(lead).toBe(1000 - 8 - 700);
  });

  it('never goes left of the stylesheet padding', () => {
    expect(toolbarLeadPadding({ toolbarWidth: 1600, basePad: 8, contentWidth: 700, targetCenter: 100 })).toBe(8);
  });

  it('falls back to the plain left-hugging layout when the bar is full', () => {
    expect(toolbarLeadPadding({ toolbarWidth: 716, basePad: 8, contentWidth: 700, targetCenter: 358 })).toBe(8);
    expect(toolbarLeadPadding({ toolbarWidth: 500, basePad: 8, contentWidth: 700, targetCenter: 250 })).toBe(8);
  });

  it('keeps room for the controls that stay at the right (… menu, zoom)', () => {
    // 1000px bar, 400px of tools, 120px of zoom: the tools may end no further right than 1000 - 8 - 120.
    expect(toolbarLeadPadding({ toolbarWidth: 1000, basePad: 8, contentWidth: 400, targetCenter: 900, reserveRight: 120 })).toBe(1000 - 8 - 400 - 120);
    expect(toolbarLeadPadding({ toolbarWidth: 1000, basePad: 8, contentWidth: 400, targetCenter: 500, reserveRight: 120 })).toBe(300);
  });

  it('ignores bad measurements', () => {
    expect(toolbarLeadPadding({ toolbarWidth: NaN, basePad: 8, contentWidth: 700, targetCenter: 300 })).toBe(8);
  });
});

describe('toolbar wiring', () => {
  const toolbar = src('../components/Toolbar.tsx');

  it('measures overflow against the stylesheet padding, then re-centres', () => {
    const measure = toolbar.slice(toolbar.indexOf('const measure = () => {'));
    expect(measure.indexOf("toolbar.style.paddingLeft = ''")).toBeGreaterThan(-1);
    expect(measure.indexOf("toolbar.style.paddingLeft = ''"))
      .toBeLessThan(measure.indexOf('const containerWidth = toolbar.clientWidth'));
    expect(measure.indexOf('centerToolbarOverPage(toolbar)'))
      .toBeLessThan(measure.indexOf('setHiddenPriorities('));
  });

  it('re-centres when the page moves (Navigator or side panel opened/resized)', () => {
    expect(toolbar).toMatch(/pageRo\.observe\(editorMain\)/);
    expect(toolbar).toMatch(/pageRo\.disconnect\(\)/);
    expect(toolbar).toMatch(/useLayoutEffect\(\(\) => \{ recenterRef\.current\(\); \}, \[hiddenPriorities, hasOverflow/);
  });

  it('a padding change alone is not treated as a toolbar resize', () => {
    expect(toolbar).toMatch(/const w = Math\.round\(toolbar\.offsetWidth\)/);
  });
});

// Christian 2026-11-14: the ☰ moves down onto the toolbar and sticks to its left; the tools are centred over the page.
describe('Navigator burger at the toolbar\'s left edge', () => {
  const menuBar = src('../components/MenuBar.tsx');

  it('is the toolbar\'s first control, pinned left, and toggles the Navigator', () => {
    const start = toolbar.indexOf('ref={toolbarRef}');
    const burger = toolbar.indexOf('toolbar-navigator-toggle toolbar-pinned-left', start);
    expect(burger).toBeGreaterThan(start);
    expect(burger).toBeLessThan(toolbar.indexOf('{/* Undo / Redo', start));
    const button = toolbar.slice(burger, toolbar.indexOf('</button>', burger));
    expect(button).toMatch(/toggleNavigator\(\)/);
    expect(button).toMatch(/aria-pressed=\{navigatorOpenNow\}/);
    expect(button).toMatch(/<FaBars \/>/);
    // Christian 2026-11-15: it hangs below the toolbar, in the writing area's corner, so the toolbar needs no room for it.
    const css = src('../styles/screenplay.css');
    expect(css).not.toMatch(/has-nav-toggle/);
    expect(toolbar).not.toMatch(/has-nav-toggle/);
    expect(css).toMatch(/\.toolbar-navigator-toggle \{\s*position: absolute; left: 6px; top: calc\(100% \+ 6px\);/);
    // Past the Navigator when it's open, so it never covers the Navigator's tabs.
    expect(button).toMatch(/left: \(navigatorOpenNow \? navPanelWidthNow \+ 4 : 0\) \+ 6/);
    // A Doc shown full width leaves the corner free.
    expect(src('../components/DocView.css')).toMatch(/\.doc-split:not\(\.on\) \.doc-view-bar \{ padding-left: 44px; \}/);
  });

  it('is no longer on the docked menu bar; the floating menu keeps its own', () => {
    expect(menuBar).toMatch(/<div className=\{menuBarClass\} ref=\{menuRef\}>\s*\{\/\*[^*]*\*\/\}\s*\{renderMenuItems\(false\)\}/);
    expect(menuBar).toMatch(/menu-bar--floating" style=\{mStyle\} ref=\{menuRef\}>\s*\{renderMenuItems\(\)\}/);
  });

  it('only the tools before the spacer are centred; the … menu and zoom stay right', () => {
    expect(toolbar).toMatch(/<div className="toolbar-spacer" style=\{\{ flex: 1 \}\} \/>/);
    const centring = src('./toolbarCentering.ts');
    expect(centring).toMatch(/classList\.contains\('toolbar-spacer'\)/);
    expect(centring).toMatch(/reserveRight:/);
  });
});
const toolbar = src('../components/Toolbar.tsx');
