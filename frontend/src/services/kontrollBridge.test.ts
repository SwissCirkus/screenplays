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
    box.hello({ engines: [{ id: 'claude-sonnet', label: 'Claude Sonnet' }, { bad: 1 }], engine: '', fallback: 'claude-sonnet', docs: true, open: true });
    expect(bridge.inKontroll()).toBe(true);
    expect(bridge.useKontrollBridge.getState().hello).toEqual({
      engines: [{ id: 'claude-sonnet', label: 'Claude Sonnet' }], engine: '', fallback: 'claude-sonnet', docs: true, open: true,
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

    // A reply for a request nobody is waiting for is ignored.
    expect(() => box.reply('nope', { ok: true })).not.toThrow();
    log.mockRestore();
  });

  it('readHello refuses junk', async () => {
    const { readHello } = await import('./kontrollBridge');
    expect(readHello(null)).toBeNull();
    expect(readHello('x')).toBeNull();
    expect(readHello({})).toEqual({ engines: [], engine: '', fallback: '', docs: false, open: false });
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
  it('the Script Assistant is a registered opt-in add-on with a menu-bar button', () => {
    expect(src('../addons/index.ts')).toMatch(/scriptAssistant,\s*\]/);
    const menu = src('../components/MenuBar.tsx');
    expect(menu).toMatch(/pluginRegistry\.isActive\('script-assistant'\) &&/);
    expect(menu).toMatch(/detail: \{ panelId: 'script-assistant-panel' \}/);
  });
});
