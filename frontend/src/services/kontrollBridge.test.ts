import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The page runs in Kontroll's web tab; here a bare `window` stands in for it.
const win: Record<string, unknown> = {};
beforeAll(() => { vi.stubGlobal('window', win); });

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the Kontroll mailbox (window.__kScreen)', () => {
  it('asks for hello on install, queues requests with the console signal, and resolves on reply', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const bridge = await import('./kontrollBridge');
    expect(bridge.inKontroll()).toBe(false);
    bridge.installKontrollBridge();
    const box = win.__kScreen as { take(): Array<Record<string, unknown>>; reply(id: string, d: unknown): void; hello(i: unknown): void };
    expect(log).toHaveBeenCalledWith('[kontroll-screen]');
    expect(box.take()).toEqual([{ kind: 'hello' }]);

    // Kontroll's hello, exactly the shape app.js screenHello sends.
    box.hello({ engines: [{ id: 'claude-sonnet', label: 'Claude Sonnet' }, { bad: 1 }], engine: '', fallback: 'claude-sonnet', docs: true, open: true, story: true, mic: true, browser: true });
    expect(bridge.inKontroll()).toBe(true);
    expect(bridge.useKontrollBridge.getState().hello).toEqual({
      engines: [{ id: 'claude-sonnet', label: 'Claude Sonnet' }], engine: '', fallback: 'claude-sonnet', docs: true, open: true, story: true, mic: true, browser: true,
    });

    const pending = bridge.kontrollAi('SYS', 'USER', 'gpt-5', 32000);
    const [req] = box.take();
    expect(req).toMatchObject({ kind: 'ai', system: 'SYS', user: 'USER', engine: 'gpt-5', maxTokens: 32000 });
    box.reply(String(req.id), { ok: true, text: '{"reply":"hi","edits":[]}', error: '', cancelled: false, engine: 'gpt-5' });
    await expect(pending).resolves.toEqual({ ok: true, text: '{"reply":"hi","edits":[]}', error: '', cancelled: false, engine: 'gpt-5' });

    const doc = bridge.kontrollReadDoc('https://docs.google.com/document/d/abc/edit');
    const [dreq] = box.take();
    expect(dreq).toMatchObject({ kind: 'doc', url: 'https://docs.google.com/document/d/abc/edit' });
    box.reply(String(dreq.id), { ok: false, needSignIn: true, error: 'Google wants a sign-in' });
    await expect(doc).resolves.toMatchObject({ ok: false, needSignIn: true, text: '' });

    // Send to Kontroll Story Builder: the script's Fountain text and title; Kontroll answers with the scene count.
    const sent = bridge.kontrollSendToStoryBuilder('Goldpaw', 'INT. LAB - DAY\n\nMara works.\n');
    const [sreq] = box.take();
    expect(sreq).toMatchObject({ kind: 'story', title: 'Goldpaw', fountain: 'INT. LAB - DAY\n\nMara works.\n' });
    box.reply(String(sreq.id), { ok: true, scenes: 1, story: 'Story 1' });
    await expect(sent).resolves.toEqual({ ok: true, scenes: 1, story: 'Story 1', error: '' });
    const refused = bridge.kontrollSendToStoryBuilder('X', 'Y');
    const [rreq] = box.take();
    box.reply(String(rreq.id), { ok: false, error: 'Open a Kontroll project first' });
    await expect(refused).resolves.toMatchObject({ ok: false, error: 'Open a Kontroll project first' });

    // The Script Assistant's mic: start with the box's text, Kontroll says when it records and sends the dictated text.
    const mbox = box as unknown as { dictated(t: string): void; micState(on: boolean): void; micLevel(l: number[] | null): void };
    bridge.kontrollMic(true, 'Tighten');
    expect(box.take()).toEqual([{ kind: 'mic', on: true, text: 'Tighten' }]);
    mbox.micState(true);
    // the live level while it listens (Christian 2026-11-15: "so I know it's actually listening")
    mbox.micLevel([0.2, 0.9, 1.4, -1]);
    expect(bridge.useKontrollBridge.getState().micLevels).toEqual([0.2, 0.9, 1, 0]);
    mbox.dictated('Tighten scene four');
    expect(bridge.useKontrollBridge.getState()).toMatchObject({ micOn: true, dictation: 'Tighten scene four' });
    bridge.kontrollMic(false);
    expect(box.take()).toEqual([{ kind: 'mic', on: false }]);
    // stopped: the words are being written out until Kontroll says it's done
    expect(bridge.useKontrollBridge.getState()).toMatchObject({ micOn: true, micStopping: true, micLevels: null });
    mbox.micState(false);
    expect(bridge.useKontrollBridge.getState()).toMatchObject({ micOn: false, micStopping: false });

    // A reply for a request nobody is waiting for is ignored.
    expect(() => box.reply('nope', { ok: true })).not.toThrow();
    log.mockRestore();
  });

  it('readHello refuses junk', async () => {
    const { readHello } = await import('./kontrollBridge');
    expect(readHello(null)).toBeNull();
    expect(readHello('x')).toBeNull();
    expect(readHello({})).toEqual({ engines: [], engine: '', fallback: '', docs: false, open: false, story: false, mic: false, browser: false });
  });
});

describe('wiring', () => {
  it('the mailbox is installed when the app starts', () => {
    const main = src('../main.tsx');
    expect(main).toMatch(/import \{ installKontrollBridge \} from '\.\/services\/kontrollBridge';/);
    expect(main).toMatch(/^installKontrollBridge\(\);/m);
  });
  it('links open in a Kontroll web tab inside Kontroll', () => {
    expect(src('./projectLinks.ts')).toMatch(/if \(inKontroll\(\)\) \{\s*void kontrollOpen\(url\)/);
  });
  it('the Script Assistant is turned on once inside Kontroll, never again after the writer turns it off', () => {
    const b = src('./kontrollBridge.ts');
    expect(b).toMatch(/useKontrollBridge\.setState\(\{ hello \}\);\s*autoEnableAssistant\(\);/);
    expect(b).toMatch(/if \(storage\.getItem\(AUTO_KEY\)\) return;/);
  });
  it("Kontroll's commands wait until the library has started", () => {
    expect(src('./kontrollBridge.ts')).toContain("import('./api').then((a) => a.storageReady).then(() => import('./kontrollCommands'))");
    const api = src('./api.ts');
    expect(api).toContain('export const storageReady: Promise<void> = new Promise');
    expect(api).toContain('try { await initStorageNow(); } finally { markStorageReady(); }');
  });
  it('a script saved into a project shows in the Projects panel at once', () => {
    const ed = src('../components/ScreenplayEditor.tsx');
    const at = ed.indexOf('const handleSaveAsComplete = useCallback(');
    expect(ed.slice(at, at + 4000)).toContain("window.dispatchEvent(new CustomEvent('screenplays:library-changed'));");
    expect(src('../components/NavigatorProjects.tsx')).toContain("window.addEventListener('screenplays:library-changed', onChanged);");
  });
  it('a dropped script is saved at once: into the open project, else Unfiled — never a new folder', () => {
    const ed = src('../components/ScreenplayEditor.tsx');
    const at = ed.indexOf('const importDroppedFile = useCallback(');
    const body = ed.slice(at, ed.indexOf('const handleEditorDragOver', at));
    expect(body).toContain('const project = currentProject ?? await ensureUnfiled();');
    expect(body).toContain('nextUntitled(list.map((m) => m.title), (imported.title || title).trim()');
    expect(body).not.toContain('createProject');
    // saved before the page shows it, so the open script is never the one written over
    expect(body.indexOf('await api.createScript(project.id')).toBeLessThan(body.indexOf('editor.commands.setContent(imported.doc, true)'));
    expect(body).toContain("window.dispatchEvent(new CustomEvent('screenplays:library-changed'));");
    expect(body).toContain('}, [editor, currentProject, setDocumentTitle, setCurrentProject, setCurrentScriptId]);');
  });
  it('Unfiled is listed at the top, and its scripts can be dragged onto a folder', () => {
    const nav = src('../components/NavigatorProjects.tsx');
    expect(nav).toContain('const unfiled = projects?.find(isUnfiled) ?? null;');
    expect(nav).toContain('void moveScript(from, scriptId, projectId);');
  });
  it('the Script Assistant is a registered opt-in add-on with a menu-bar button', () => {
    expect(src('../addons/index.ts')).toMatch(/scriptAssistant,\s*\]/);
    const menu = src('../components/MenuBar.tsx');
    expect(menu).toMatch(/pluginRegistry\.isActive\('script-assistant'\) &&/);
    expect(menu).toMatch(/detail: \{ panelId: 'script-assistant-panel' \}/);
  });
});

describe("Table Read on Kontroll's local voices", () => {
  it('lists voices and speaks a line through the mailbox', async () => {
    const bridge = await import('./kontrollBridge');
    bridge.installKontrollBridge();
    const box = win.__kScreen as { take(): Array<Record<string, unknown>>; reply(id: string, d: unknown): void };
    box.take();
    const list = bridge.kontrollVoices();
    const [vreq] = box.take();
    expect(vreq).toMatchObject({ kind: 'voices' });
    // exactly what app.js screenVoices answers
    box.reply(String(vreq.id), { ok: true, voices: [
      { id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', gender: 'female', detail: 'Kokoro · US female' },
      { id: 'pocket:javert', name: 'Javert', lang: '', gender: 'male', detail: 'Pocket TTS · slower, starts for every line' },
      { id: 'no-colon', name: 'x' },
    ] });
    const voices = await list;
    expect(voices.ok).toBe(true);
    expect(voices.voices.map((v) => v.id)).toEqual(['kokoro:af_heart', 'pocket:javert']);

    const said = bridge.kontrollSpeak('pocket:javert', 'Close it.');
    const [treq] = box.take();
    expect(treq).toMatchObject({ kind: 'tts', voice: 'pocket:javert', text: 'Close it.', rate: 1 });
    box.reply(String(treq.id), { ok: true, base64: 'UklGRg==', mime: 'audio/wav' });
    await expect(said).resolves.toMatchObject({ ok: true, base64: 'UklGRg==', mime: 'audio/wav' });

    const failed = bridge.kontrollSpeak('kokoro:af_heart', 'Hi');
    const [freq] = box.take();
    box.reply(String(freq.id), { ok: false, error: 'Kokoro is still downloading' });
    await expect(failed).resolves.toMatchObject({ ok: false, error: 'Kokoro is still downloading' });
  });

  it('Kontroll is a voice provider, configured only inside Kontroll, and picked when nothing was chosen yet', async () => {
    const vs = await import('../stores/voiceSettingsStore');
    expect(vs.AI_PROVIDERS[0]).toMatchObject({ id: 'kontroll', local: true });
    expect(vs.providerIsRemote('kontroll')).toBe(false);
    // hello already arrived above, so Kontroll is here
    expect(vs.isAiProviderConfigured({ aiProvider: 'kontroll', apiKeys: {}, compatibleBaseUrl: '' })).toBe(true);
    const store = vs.useVoiceSettingsStore;
    store.setState({ engineChosen: false, aiProvider: '' });
    vs.chooseKontrollVoicesIfUnset();
    expect(store.getState()).toMatchObject({ aiProvider: 'kontroll', enginePreference: 'ai', engineChosen: true });
    // "System voices" has nothing to read with in Kontroll's tab, so it moves to Kontroll's voices (Christian 2026-11-15)
    store.setState({ engineChosen: true, enginePreference: 'system', aiProvider: '' });
    vs.chooseKontrollVoicesIfUnset();
    expect(store.getState()).toMatchObject({ aiProvider: 'kontroll', enginePreference: 'ai' });
    // another AI provider the writer picked is never changed
    store.setState({ engineChosen: true, enginePreference: 'ai', aiProvider: 'elevenlabs' });
    vs.chooseKontrollVoicesIfUnset();
    expect(store.getState()).toMatchObject({ enginePreference: 'ai', aiProvider: 'elevenlabs' });
  });

  it('inside Kontroll, Table Read offers only AI voices (Kontroll voices), never the empty System voices', async () => {
    const eng = await import('./tts/engines');
    expect(eng.availableEngineKinds()).toEqual(['ai']);
    expect(eng.activeEngineKind({ enginePreference: 'system', engineChosen: true })).toBe('ai');
    expect(eng.selectedEngineKind({ enginePreference: 'system', engineChosen: true, aiProvider: 'kontroll', apiKeys: {}, compatibleBaseUrl: '' })).toBe('ai');
  });

  it('the voice engine reads Kontroll voices and the settings only offer them inside Kontroll', () => {
    const engine = src('./tts/aiEngine.ts');
    expect(engine).toMatch(/p === 'kontroll'\) \{\s*list = await this\.kontrollVoiceList\(\);/);
    expect(engine).toMatch(/const r = await kontrollSpeak\(voice, text\);/);
    const ui = src('../components/VoiceProviderSettings.tsx');
    expect(ui).toMatch(/p\.id !== 'kontroll' \|\| kontrollHere \|\| s\.aiProvider === 'kontroll'/);
    const panel = src('../components/TableReadPanel.tsx');
    expect(panel).toMatch(/t\('tableRead\.autoAssignAll'\)/);
    expect(panel).toMatch(/setNarratorVoice\(slot, undefined\);/);
  });
});
