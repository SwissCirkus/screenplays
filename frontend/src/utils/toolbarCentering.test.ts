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

describe('Navigator burger in the menu bar', () => {
  const menuBar = src('../components/MenuBar.tsx');

  it('sits before File on the docked menu bar and toggles the Navigator', () => {
    const items = menuBar.slice(menuBar.indexOf('const renderMenuItems = ('));
    const burger = items.indexOf('menu-navigator-toggle');
    expect(burger).toBeGreaterThan(-1);
    expect(burger).toBeLessThan(items.indexOf('className="menu-triggers"'));
    const button = items.slice(burger, items.indexOf('</button>'));
    expect(button).toMatch(/toggleNavigator\(\)/);
    expect(button).toMatch(/aria-pressed=\{navigatorOpen\}/);
    expect(button).toMatch(/<FaBars \/>/);
  });

  it('only on the docked bar, not inside the floating menu (which has its own burger)', () => {
    expect(menuBar).toMatch(/<div className=\{menuBarClass\} ref=\{menuRef\}>\s*\{renderMenuItems\(true\)\}/);
    expect(menuBar).toMatch(/menu-bar--floating" style=\{mStyle\} ref=\{menuRef\}>\s*\{renderMenuItems\(\)\}/);
  });

  it('has its own style rule', () => {
    expect(src('../styles/screenplay.css')).toMatch(/\.menu-navigator-toggle \{/);
  });
});
