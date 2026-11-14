import { beforeEach, describe, expect, it } from 'vitest';
import { byokAi, byokChoice, listModels, useByok } from './byokAi';

interface Seen { url: string; headers: Record<string, string>; body: any }

function headersOf(init?: RequestInit, req?: Request): Record<string, string> {
  const h = new Headers(req ? req.headers : init?.headers);
  const out: Record<string, string> = {};
  h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

function fakeFetch(respond: (s: Seen) => Response) {
  const seen: Seen[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const raw = init?.body ?? (req ? await req.text() : undefined);
    const s: Seen = { url, headers: headersOf(init, req ?? undefined), body: raw ? JSON.parse(String(raw)) : null };
    seen.push(s);
    return respond(s);
  }) as typeof fetch;
  return { f, seen };
}

function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function claudeStream(text: string, stop = 'end_turn') {
  return sse([
    ['message_start', { type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

beforeEach(() => {
  localStorage.clear();
  useByok.setState({ provider: 'anthropic', keys: {}, models: {} });
});

describe('bring your own key', () => {
  it('needs a key before it calls anything', async () => {
    const { f, seen } = fakeFetch(() => new Response('{}'));
    const r = await byokAi('sys', 'hi', 100, undefined, f);
    expect(r.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('keeps the key in this browser only, and defaults Claude to Opus 5.5', () => {
    useByok.getState().setKey('anthropic', '  sk-ant-test  ');
    expect(JSON.parse(localStorage.getItem('screenplays:byok')!).keys.anthropic).toBe('sk-ant-test');
    expect(byokChoice()).toEqual({ provider: 'anthropic', key: 'sk-ant-test', model: 'claude-opus-5-5' });
    useByok.getState().forget('anthropic');
    expect(byokChoice()).toBeNull();
  });

  it('calls Claude straight from the browser, streamed, with the fallback on', async () => {
    useByok.getState().setKey('anthropic', 'sk-ant-test');
    const { f, seen } = fakeFetch(() => claudeStream('{"reply":"ok","edits":[]}'));
    const r = await byokAi('SYSTEM', 'USER', 32000, undefined, f);
    expect(r).toEqual({ ok: true, text: '{"reply":"ok","edits":[]}' });
    const s = seen[0];
    expect(s.url).toContain('https://api.anthropic.com/v1/messages');
    expect(s.headers['x-api-key'] ?? s.headers.authorization).toMatch(/^(Bearer )?sk-ant-test$/);
    expect(s.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(s.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(s.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 32000, system: 'SYSTEM', stream: true, fallbacks: 'default', messages: [{ role: 'user', content: 'USER' }] });
  });

  it('says so when Claude declines', async () => {
    useByok.getState().setKey('anthropic', 'sk-ant-test');
    const { f } = fakeFetch(() => claudeStream('', 'refusal'));
    const r = await byokAi('s', 'u', 100, undefined, f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/declined/);
  });

  it('turns a rejected key into a plain message', async () => {
    useByok.getState().setKey('anthropic', 'bad');
    const { f } = fakeFetch(() => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
    const r = await byokAi('s', 'u', 100, undefined, f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/key was not accepted/);
  });

  it('calls OpenAI with the chosen model', async () => {
    const st = useByok.getState();
    st.setProvider('openai'); st.setKey('openai', 'sk-o'); st.setModel('openai', 'gpt-test');
    const { f, seen } = fakeFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] })));
    const r = await byokAi('SYS', 'USR', 8000, undefined, f);
    expect(r).toEqual({ ok: true, text: 'hello' });
    expect(seen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(seen[0].headers.authorization).toBe('Bearer sk-o');
    expect(seen[0].body).toEqual({ model: 'gpt-test', max_completion_tokens: 8000, messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USR' }] });
  });

  it('calls Gemini with the key in a header, not the address', async () => {
    const st = useByok.getState();
    st.setProvider('gemini'); st.setKey('gemini', 'AIza-x'); st.setModel('gemini', 'gemini-test');
    const { f, seen } = fakeFetch(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })));
    const r = await byokAi('SYS', 'USR', 8000, undefined, f);
    expect(r).toEqual({ ok: true, text: 'ab' });
    expect(seen[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(seen[0].url).not.toContain('AIza');
    expect(seen[0].headers['x-goog-api-key']).toBe('AIza-x');
    expect(seen[0].body.systemInstruction.parts[0].text).toBe('SYS');
  });

  it('needs a model picked for OpenAI and Gemini', async () => {
    const st = useByok.getState();
    st.setProvider('openai'); st.setKey('openai', 'sk-o');
    const { f, seen } = fakeFetch(() => new Response('{}'));
    const r = await byokAi('s', 'u', 10, undefined, f);
    expect(r.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('Stop cancels the call', async () => {
    const st = useByok.getState();
    st.setProvider('openai'); st.setKey('openai', 'sk-o'); st.setModel('openai', 'gpt-test');
    const ctl = new AbortController();
    const f = ((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;
    const p = byokAi('s', 'u', 10, ctl.signal, f);
    ctl.abort();
    expect(await p).toEqual({ ok: false, text: '', cancelled: true });
  });

  it('lists only chat models a key can use', async () => {
    const { f } = fakeFetch((s) => s.url.includes('openai')
      ? new Response(JSON.stringify({ data: [{ id: 'gpt-a', created: 1 }, { id: 'gpt-b', created: 2 }, { id: 'text-embedding-3', created: 3 }, { id: 'gpt-a-tts', created: 4 }] }))
      : new Response(JSON.stringify({ models: [{ name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] }] })));
    expect((await listModels('openai', 'k', f)).map((m) => m.id)).toEqual(['gpt-b', 'gpt-a']);
    expect(await listModels('gemini', 'k', f)).toEqual([{ id: 'gemini-x', label: 'Gemini X' }]);
  });
});
