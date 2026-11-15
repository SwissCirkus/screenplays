import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dictationMode, transcribeWithKey } from './browserDictation';
import { useByok } from './byokAi';
import { voiceNotesTitle } from '../components/voiceNotesTitle';

// The browser mic and Voice notes (Christian 2026-11-15).
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

beforeEach(() => { localStorage.clear(); useByok.setState({ provider: 'anthropic', keys: {}, models: {} }); });
afterEach(() => { vi.unstubAllGlobals(); delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; });

describe('browser dictation', () => {
  it("uses the browser's speech recognition where there is one, else an OpenAI or Gemini key, else nothing", () => {
    expect(dictationMode()).toBeNull();
    useByok.getState().setKey('anthropic', 'sk-ant');
    expect(dictationMode()).toBeNull(); // Claude has no speech-to-text
    useByok.getState().setKey('openai', 'sk-o');
    expect(dictationMode()).toBe('key');
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = function Rec() { /* stub */ };
    expect(dictationMode()).toBe('live');
  });

  it('writes a recording out with OpenAI (Whisper) on the writer’s key', async () => {
    useByok.getState().setKey('openai', 'sk-o');
    let seen: { url: string; auth: string; model: unknown } | null = null;
    const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), auth: new Headers(init?.headers).get('Authorization') ?? '', model: (init?.body as FormData).get('model') };
      return new Response(JSON.stringify({ text: 'Scene one, the kitchen.' }));
    }) as typeof fetch;
    expect(await transcribeWithKey(new Blob(['x'], { type: 'audio/webm' }), f)).toBe('Scene one, the kitchen.');
    expect(seen).toEqual({ url: 'https://api.openai.com/v1/audio/transcriptions', auth: 'Bearer sk-o', model: 'whisper-1' });
  });

  it('or with Gemini, the audio inline', async () => {
    useByok.getState().setKey('gemini', 'AIza'); useByok.getState().setModel('gemini', 'gemini-test');
    let body: any = null;
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello there.' }] } }] }));
    }) as typeof fetch;
    expect(await transcribeWithKey(new Blob(['x'], { type: 'audio/webm' }), f)).toBe('Hello there.');
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/webm');
  });

  it('the Script Assistant has the browser mic outside Kontroll', () => {
    const panel = src('../addons/script-assistant/ScriptAssistantPanel.tsx');
    expect(panel).toMatch(/\{!hello && \(\s*<button\s*type="button"\s*className=\{`sa-mic\$\{webMic === 'on' \? ' live' : ''\}`\}/);
    expect(panel).toMatch(/webMicRef\.current = await startDictation\(\{/);
  });
});

describe('Voice notes into a Google Doc', () => {
  it('names a new notes Doc by date and time', () => {
    expect(voiceNotesTitle(new Date(2026, 10, 15, 9, 5))).toBe('Voice notes – 15 Nov 2026, 09:05');
  });

  it('adds each spoken piece to the end of the Doc, in order, and is in the Tools menu', () => {
    const vn = src('../components/VoiceNotes.tsx');
    expect(vn).toMatch(/onChunk: \(piece\) => write\(piece\)/);
    expect(vn).toMatch(/queue\.current = queue\.current\.then\(async \(\) => \{\s*try \{\s*await appendToDocAnyAccess\(into\.url, piece\);/);
    expect(src('../components/MenuBar.tsx')).toMatch(/label: 'Voice notes into a Google Doc…', action: \(\) => useVoiceNotes\.getState\(\)\.setOpen\(true\)/);
  });
});
