import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./screenplay.css', import.meta.url), 'utf8');

// SwissCirkus fork (Christian 2026-11-15): Kontroll's scroll bars, and the Navigator's tabs on two rows instead of a scroll bar.
describe("Kontroll's look in the writer", () => {
  it('the Navigator tabs wrap instead of scrolling sideways', () => {
    const rule = /\.navigator-tabs-scroll \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/flex-wrap: wrap;/);
    expect(rule).toMatch(/overflow: hidden;/);
    expect(rule).not.toMatch(/scrollbar-width: thin/);
    expect(css).not.toMatch(/\.navigator-tabs-scroll::-webkit-scrollbar/);
  });

  it('every scroll bar is 14 px, flat, square, with no arrows', () => {
    expect(css).toMatch(/\* \{ scrollbar-width: auto !important; scrollbar-color: auto !important; \}/);
    expect(css).toMatch(/::-webkit-scrollbar \{ width: 14px !important; height: 14px !important; \}/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb \{[^}]*border-radius: 0 !important;/);
    expect(css).toMatch(/::-webkit-scrollbar-button \{ display: none !important;/);
  });
});
