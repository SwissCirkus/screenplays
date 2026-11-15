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

// Christian 2026-11-14/15: the ☰ leaves the bars for the writing area's top-left corner; the tools join the menu bar's row
// when they all fit, and keep their own row below it when they don't.
describe('Navigator burger in the writing area\'s corner', () => {
  const menuBar = src('../components/MenuBar.tsx');

  it('is portalled into the corner, toggles the Navigator, and takes no toolbar room', () => {
    const burger = toolbar.indexOf('const burger = (');
    expect(burger).toBeGreaterThan(-1);
    const button = toolbar.slice(burger, toolbar.indexOf('</button>', burger));
    expect(button).toMatch(/toggleNavigator\(\)/);
    expect(button).toMatch(/aria-pressed=\{navigatorOpenNow\}/);
    expect(button).toMatch(/<FaBars \/>/);
    expect(toolbar).toMatch(/\{navCorner && createPortal\(burger, navCorner\)\}/);
    const editor = src('../components/ScreenplayEditor.tsx');
    const center = editor.indexOf('<div className="editor-center">');
    expect(editor.indexOf('<div className="nav-corner" ref={setNavCorner} />', center)).toBeGreaterThan(center);
    const css = src('../styles/screenplay.css');
    expect(css).not.toMatch(/has-nav-toggle/);
    expect(css).toMatch(/\.nav-corner \{ position: relative; height: 0;/);
    expect(css).toMatch(/\.toolbar-navigator-toggle \{\s*position: absolute; left: 6px; top: 6px;/);
    expect(src('../components/DocView.css')).toMatch(/\.doc-split:not\(\.on\) \.doc-view-bar \{ padding-left: 44px; \}/);
  });

  it('the tools join the docked menu bar only when every one of them fits', () => {
    expect(menuBar).toMatch(/<div className="menu-spacer menu-toolbar-slot" ref=\{setToolbarSlot\} \/>/);
    expect(menuBar).toMatch(/\{renderMenuItems\(false, true\)\}/);
    expect(toolbar).toMatch(/\{inMenu && toolbarSlot \? createPortal\(bar, toolbarSlot\) : bar\}/);
    const measure = toolbar.slice(toolbar.indexOf('const measure = () => {'));
    const decide = measure.indexOf('setInMenu(!!slot && !phoneChromeNow() && slot.clientWidth >= needed)');
    expect(decide).toBeGreaterThan(-1);
    // Measured with every group shown (before any fold into "…") and without the spacer's slack.
    expect(decide).toBeLessThan(measure.indexOf('if (totalWidth > containerWidth)'));
    expect(measure).toMatch(/const needed = totalWidth - \(spacer \? spacer\.offsetWidth \+ 2 : 0\) \+ 16;/);
    expect(toolbar).toMatch(/ro\.observe\(toolbarSlot\)/);
  });

  it('is no longer on the docked menu bar; the floating menu keeps its own', () => {
    expect(menuBar).toMatch(/<div className=\{menuBarClass\} ref=\{menuRef\}>\s*\{\/\*[^*]*\*\/\}\s*\{renderMenuItems\(false, true\)\}/);
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
