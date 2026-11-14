import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LINK_MIME, dragMayCarryLink, googleFileId, isLinkAsset, linkDisplayName, linkFileText, linkFromDataTransfer,
  linkKind, makeLinkFile, normalizeLinkUrl, parseLinkFile,
} from './linkAssets';
import { scriptRoute } from './projectRoutes';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const DOC = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';

function dt(data: Record<string, string>) {
  return { getData: (type: string) => data[type] ?? '', types: Object.keys(data) };
}

describe('normalizeLinkUrl', () => {
  it('keeps http(s) links and adds https:// to a bare domain', () => {
    expect(normalizeLinkUrl(`  ${DOC}  `)).toBe(DOC);
    expect(normalizeLinkUrl('docs.google.com/document/d/abc')).toBe('https://docs.google.com/document/d/abc');
  });
  it('refuses anything that is not a web link', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'file:///C:/x.txt', 'notes', 'mailto:a@b.co', 'data:text/html,hi']) {
      expect(normalizeLinkUrl(bad), bad).toBeNull();
    }
  });
});

describe('linkKind / googleFileId', () => {
  it('tells Docs, Sheets, Slides, Drive and other links apart', () => {
    expect(linkKind(DOC)).toBe('gdoc');
    expect(linkKind('https://docs.google.com/spreadsheets/d/xyz/edit')).toBe('gsheet');
    expect(linkKind('https://docs.google.com/presentation/d/xyz/edit')).toBe('gslides');
    expect(linkKind('https://drive.google.com/file/d/xyz/view')).toBe('gdrive');
    expect(linkKind('https://example.com/notes')).toBe('web');
  });
  it('finds the Google file id', () => {
    expect(googleFileId(DOC)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(googleFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(googleFileId('https://example.com/')).toBeNull();
  });
});

describe('link files (.url Internet Shortcut)', () => {
  it('round-trips the URL through the stored file', async () => {
    const file = makeLinkFile(DOC, 'Notes: draft 2 / Vincent', 'Google Doc');
    expect(file.type).toBe(LINK_MIME);
    expect(file.name).toBe('Notes draft 2 Vincent.url');
    expect(parseLinkFile(await file.text())).toBe(DOC);
    expect(linkFileText(DOC)).toMatch(/^\[InternetShortcut\]\r\nURL=/);
  });
  it('uses the fallback name when none is given', () => {
    expect(makeLinkFile(DOC, '   ', 'Google Doc').name).toBe('Google Doc.url');
  });
  it('rejects a file whose URL is not a web link', () => {
    expect(parseLinkFile('[InternetShortcut]\r\nURL=javascript:alert(1)\r\n')).toBeNull();
    expect(parseLinkFile('nothing here')).toBeNull();
  });
  it('recognises link assets by the real asset fields (mime_type, original_name)', () => {
    // Same shape web-storage.ts uploadAsset writes.
    const meta = { id: 'a1', filename: 'a1.url', original_name: 'Story notes.url', mime_type: LINK_MIME, size_bytes: 60, tags: [], created_at: '' };
    expect(isLinkAsset(meta)).toBe(true);
    expect(linkDisplayName(meta)).toBe('Story notes');
    // A .url synced back from elsewhere with a generic type still counts.
    expect(isLinkAsset({ ...meta, mime_type: 'application/octet-stream' })).toBe(true);
    expect(isLinkAsset({ ...meta, original_name: 'still.png', filename: 'a1.png', mime_type: 'image/png' })).toBe(false);
  });
});

describe('linkFromDataTransfer (dragging a doc in from a browser)', () => {
  it('reads a dragged Chrome tab: URL from uri-list, title from the html anchor', () => {
    expect(linkFromDataTransfer(dt({
      'text/uri-list': DOC,
      'text/plain': DOC,
      'text/html': `<a href="${DOC}">Episode 3 &amp; notes - Google Docs</a>`,
    }))).toEqual({ url: DOC, name: 'Episode 3 & notes - Google Docs' });
  });
  it('skips uri-list comments and takes Firefox titles', () => {
    expect(linkFromDataTransfer(dt({
      'text/uri-list': `# comment\r\n${DOC}`,
      'text/x-moz-url': `${DOC}\nOutline`,
    }))).toEqual({ url: DOC, name: 'Outline' });
  });
  it('accepts a plain-text URL but never uses the URL as its own name', () => {
    expect(linkFromDataTransfer(dt({ 'text/plain': DOC, 'text/html': `<a href="${DOC}">${DOC}</a>` }))).toEqual({ url: DOC, name: '' });
  });
  it('ignores dragged text that is not a link', () => {
    expect(linkFromDataTransfer(dt({ 'text/plain': 'INT. KITCHEN - DAY' }))).toBeNull();
  });
  it('dragover only accepts drags that may carry a link', () => {
    expect(dragMayCarryLink(['text/uri-list'])).toBe(true);
    expect(dragMayCarryLink(['Files'])).toBe(false);
    expect(dragMayCarryLink(undefined)).toBe(false);
  });
});

describe('Navigator › Projects tab', () => {
  const nav = src('../components/SceneNavigator.tsx');
  const tab = src('../components/NavigatorProjects.tsx');

  it('is a Navigator tab after Bookmarks', () => {
    expect(nav).toMatch(/type NavTab = [^;]*'projects'/);
    const bookmarks = nav.indexOf("setActiveTab('bookmarks')");
    const projects = nav.indexOf("setActiveTab('projects')");
    expect(bookmarks).toBeGreaterThan(-1);
    expect(projects).toBeGreaterThan(bookmarks);
    expect(nav).toMatch(/activeTab === 'projects' && <NavigatorProjects \/>/);
  });

  it('opens scripts with the same routes as Manage Projects', () => {
    expect(scriptRoute('p1', { id: 's1', format: 'screenplay' })).toBe('/project/p1/edit/s1');
    expect(scriptRoute('p1', { id: 's2', format: 'treatment' })).toBe('/project/p1/treatment/s2');
    const view = src('../components/ProjectView.tsx');
    expect(view).toContain('navigate(`/project/${projectId}/treatment/${scriptId}`');
    expect(view).toContain('navigate(`/project/${projectId}/edit/${scriptId}`');
  });

  it('saves the open script before leaving it', () => {
    expect(tab).toMatch(/leaveEditor\(\(\) => navigate\(scriptRoute\(/);
    expect(tab).toMatch(/leaveEditor\(\(\) => navigate\('\/projects'\)\)/);
  });

  it('reads link URLs before the click, so opening is not blocked as a pop-up', () => {
    expect(tab).toMatch(/readProjectLink\(projectId, asset\)/);
    expect(tab).toMatch(/onClick=\{\(\) => \{ if \(url\) openLinkInNewTab\(url\); \}\}/);
  });

  it('lists projects and contents through the same api Manage Projects uses', () => {
    expect(tab).toMatch(/api\.listProjects\(\)/);
    expect(tab).toMatch(/api\.listScripts\(projectId\)/);
    expect(tab).toMatch(/api\.listAssets\(projectId\)/);
  });
});

describe('Manage Projects › Assets takes Google Doc links too', () => {
  const am = src('../components/AssetManager.tsx');
  it('adds pasted or dropped links and opens them on click', () => {
    expect(am).toMatch(/addProjectLink\(projectId, url, name/);
    expect(am).toMatch(/linkFromDataTransfer\(e\.dataTransfer\)/);
    expect(am).toMatch(/if \(url\) openLinkInNewTab\(url\)/);
  });
});

describe('Navigator › Projects right-click menus (what Manage Projects can do)', () => {
  const tab = src('../components/NavigatorProjects.tsx');
  const menu = src('../components/NavContextMenu.tsx');
  const items = (fn: string) => tab.slice(tab.indexOf(`const ${fn} = (`), tab.indexOf('];', tab.indexOf(`const ${fn} = (`)));

  it('a project offers open, new script, add Google Doc, rename, pin, colour, new project and delete', () => {
    const p = items('projectItems');
    for (const k of ['openProject', 'newScript', 'addLink', 'rename', 'pin', 'unpin', 'color', 'newProject', 'deleteProject']) expect(p).toContain(`L('${k}')`);
    expect(p).toMatch(/L\('deleteProject'\), danger: true/);
  });
  it('a script offers open, rename, duplicate and delete; a link open, copy and remove; empty space new project, Manage Projects, refresh', () => {
    const s = items('scriptItems');
    for (const k of ['open', 'rename', 'duplicate', 'deleteScript']) expect(s).toContain(`L('${k}')`);
    const l = items('linkItems');
    for (const k of ['openLink', 'copyLink', 'removeLink']) expect(l).toContain(`L('${k}')`);
    const b = items('backgroundItems');
    for (const k of ['newProject', 'manage', 'refresh']) expect(b).toContain(`L('${k}')`);
  });
  it('the actions go through the same api calls as Manage Projects', () => {
    for (const call of ['api.createProject(name)', 'api.updateProject(project.id, patch)', 'api.deleteProject(project.id)',
      'api.createScript(projectId', 'api.saveScript(projectId, scriptId, { title })', 'api.duplicateScript(projectId, script.id)',
      'api.deleteScript(projectId, script.id)']) expect(tab).toContain(call);
  });
  it('deleting always asks first, and leaves the editor before deleting what is open', () => {
    expect(tab).toMatch(/if \(!window\.confirm\(question\)\) return;[\s\S]{0,200}if \(currentProject\?\.id === project\.id\) await leaveEditor\(\(\) => navigate\('\/projects'\)\);\s*await api\.deleteProject/);
    expect(tab).toMatch(/deleteScriptConfirm[\s\S]{0,300}await leaveEditor\(\(\) => navigate\(`\/project\/\$\{projectId\}`[\s\S]{0,120}await api\.deleteScript/);
  });
  it('uses Manage Projects\' own colours, and a new script starts as an empty screenplay', async () => {
    const { PROJECT_COLORS, EMPTY_SCREENPLAY } = await import('./projectRoutes');
    const list = src('../components/ProjectList.tsx');
    for (const c of PROJECT_COLORS.filter(Boolean)) expect(list).toContain(`'${c}'`);
    const { fountainToNodes } = await import('../addons/script-assistant/scriptEdits');
    expect(EMPTY_SCREENPLAY.content[0].type).toBe(fountainToNodes('INT. A - DAY')[0].type);
  });
  it('the menu is the app\'s context-menu look, closes on Escape or a click elsewhere, and works from the keyboard', () => {
    expect(menu).toMatch(/className="script-context-menu nav-context-menu" role="menu"/);
    expect(menu).toMatch(/if \(e\.key === 'Escape'\)/);
    expect(menu).toMatch(/document\.addEventListener\('mousedown', down, true\)/);
    expect(menu).toMatch(/e\.key !== 'ArrowDown' && e\.key !== 'ArrowUp'/);
    expect(tab).toMatch(/e\.key === 'ContextMenu' \|\| \(e\.shiftKey && e\.key === 'F10'\)/);
  });
});
