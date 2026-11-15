import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isUnfiled, nextUntitled } from './unfiled';
import { useDocView, DOC_SPLIT_MIN } from '../stores/docViewStore';

// Christian 2026-11-15: new scripts and Docs at the top until filed; Docs side by side; the assistant reads the open Doc.
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('Unfiled', () => {
  it('names new things Untitled, then Untitled 2, 3…', () => {
    expect(nextUntitled([])).toBe('Untitled');
    expect(nextUntitled(['Untitled', 'untitled 2'])).toBe('Untitled 3');
    expect(isUnfiled({ name: ' unfiled ' })).toBe(true);
    expect(isUnfiled({ name: 'Goldpaw' })).toBe(false);
  });

  it('File › New saves into Unfiled after the format is picked; File › New Google Doc files the Doc there and opens it', () => {
    const menu = src('../components/MenuBar.tsx');
    expect(menu).toMatch(/if \(mode === 'reset' && browserLibrary\(\)\) void fileNewScriptIntoUnfiled\(\);/);
    expect(menu).toMatch(/const made = await api\.createScript\(unfiled\.id, \{ title, format: 'screenplay', content: editor\.getJSON\(\)/);
    expect(menu).toMatch(/setCurrentScriptId\(made\.meta\.id\);/);
    expect(menu).toMatch(/label: 'New Google Doc'/);
    expect(menu).toMatch(/await addProjectLink\(unfiled\.id, made\.url, made\.name, 'Google Doc'\);\s*window\.dispatchEvent\(new CustomEvent\('screenplays:library-changed'\)\);\s*useDocView\.getState\(\)\.show\(made\.url, made\.name\);/);
  });

  it('the Navigator shows Unfiled at the top and never as a folder', () => {
    const nav = src('../components/NavigatorProjects.tsx');
    expect(nav).toMatch(/const folders = projects \? projects\.filter\(\(p\) => !isUnfiled\(p\)\) : null;/);
    expect(nav).toMatch(/\{folders\?\.map\(\(project\) => \{/);
    expect(nav).toMatch(/className=\{`nav-unfiled/);
  });
});

describe('Doc side by side', () => {
  it('remembers the switch and the width, never narrower than the minimum', () => {
    useDocView.getState().setSplit(true);
    useDocView.getState().setSplitWidth(100);
    expect(useDocView.getState()).toMatchObject({ split: true, splitWidth: DOC_SPLIT_MIN });
    expect(localStorage.getItem('screenplays:docSplit')).toBe('1');
    useDocView.getState().setSplit(false);
  });

  it('the script stays visible beside the Doc only when side by side', () => {
    expect(src('../components/ScreenplayEditor.tsx')).toMatch(/style=\{docShown && !docSplit \? \{ display: 'none' \} : undefined\}/);
  });

  it('the assistant reads the Doc that is open on screen', () => {
    const panel = src('../addons/script-assistant/ScriptAssistantPanel.tsx');
    expect(panel).toMatch(/const shown = useDocView\.getState\(\)\.doc;/);
    expect(panel).toMatch(/read\.push\(\{ name: `\$\{d\.name\} \(open on screen\)`/);
  });
});
