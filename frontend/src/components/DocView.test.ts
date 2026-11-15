import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { docViewMode, liveDocUrl, saveDocViewMode } from './docViewMode';
import { useDocView } from '../stores/docViewStore';

// A Google Doc where the script page is (Christian 2026-11-15).
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

beforeEach(() => { localStorage.clear(); useDocView.getState().close(); });

describe('Doc view', () => {
  it('opens a Doc by its id, whatever form the link has', () => {
    expect(liveDocUrl('https://docs.google.com/document/d/AbC-1_x/edit?usp=sharing#h')).toBe('https://docs.google.com/document/d/AbC-1_x/edit');
    expect(liveDocUrl('https://docs.google.com/document/u/0/d/Z9/view')).toBe('https://docs.google.com/document/d/Z9/edit');
  });

  it('remembers Live Doc or Readable copy', () => {
    expect(docViewMode()).toBe('live');
    saveDocViewMode('copy');
    expect(docViewMode()).toBe('copy');
  });

  it('shows and closes', () => {
    useDocView.getState().show('https://docs.google.com/document/d/x/edit', 'Notes');
    expect(useDocView.getState().doc).toEqual({ url: 'https://docs.google.com/document/d/x/edit', name: 'Notes' });
    useDocView.getState().close();
    expect(useDocView.getState().doc).toBeNull();
  });

  it('the script stays loaded under it, and Navigator Docs open there', () => {
    const ed = src('./ScreenplayEditor.tsx');
    expect(ed).toMatch(/<DocView \/>\s*<div className=\{`editor-main[^`]*`\} style=\{docShown && !docSplit \? \{ display: 'none' \} : undefined\}/);
    expect(src('./NavigatorProjects.tsx')).toMatch(/if \(linkKind\(url\) === 'gdoc'\) useDocView\.getState\(\)\.show\(url, linkDisplayName\(asset\)\); else openLinkInNewTab\(url\);/);
    const view = src('./DocView.tsx');
    expect(view).toMatch(/sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc=\{copyHere\}/);
    expect(view).toMatch(/if \(e\.key === 'Escape'\) close\(\);/);
  });
});
