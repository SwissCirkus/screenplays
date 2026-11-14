/**
 * Bring your own key (SwissCirkus fork, Christian 2026-11-15): on the web, the Script Assistant and Smart organise run on
 * the writer's own AI key — Claude, OpenAI or Gemini. The key is kept only in this browser (localStorage, never in the
 * library, never on Drive, never on our server) and every call goes straight from the browser to that provider.
 * Inside Kontroll none of this is used: Kontroll's own models answer.
 */
import Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface ByokSettings {
  provider: AiProvider;
  keys: Partial<Record<AiProvider, string>>;
  models: Partial<Record<AiProvider, string>>;
}

export interface AiAnswer { ok: boolean; text: string; error?: string; cancelled?: boolean }

export const PROVIDERS: { id: AiProvider; label: string; keyHint: string; keyUrl: string; defaultModel: string }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', defaultModel: 'claude-opus-5-5' },
  { id: 'openai', label: 'OpenAI', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', defaultModel: '' },
  { id: 'gemini', label: 'Google Gemini', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/app/apikey', defaultModel: '' },
];

/** Claude models offered before the writer's key has listed what it can use. */
export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
];

const STORE_KEY = 'screenplays:byok';

function readSaved(): ByokSettings {
  const empty: ByokSettings = { provider: 'anthropic', keys: {}, models: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return empty;
    const v = JSON.parse(raw) as Partial<ByokSettings>;
    const provider = PROVIDERS.some((p) => p.id === v.provider) ? (v.provider as AiProvider) : 'anthropic';
    return { provider, keys: { ...(v.keys ?? {}) }, models: { ...(v.models ?? {}) } };
  } catch {
    return empty;
  }
}

function save(s: ByokSettings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private window: lasts for this visit only */ }
}

interface ByokState extends ByokSettings {
  setProvider(p: AiProvider): void;
  setKey(p: AiProvider, key: string): void;
  setModel(p: AiProvider, model: string): void;
  forget(p: AiProvider): void;
}

export const useByok = create<ByokState>((set, get) => {
  const keep = (next: Partial<ByokSettings>) => {
    const cur = get();
    const s: ByokSettings = { provider: next.provider ?? cur.provider, keys: next.keys ?? cur.keys, models: next.models ?? cur.models };
    save(s);
    set(s);
  };
  return {
    ...readSaved(),
    setProvider: (provider) => keep({ provider }),
    setKey: (p, key) => keep({ keys: { ...get().keys, [p]: key.trim() } }),
    setModel: (p, model) => keep({ models: { ...get().models, [p]: model } }),
    forget: (p) => {
      const keys = { ...get().keys };
      delete keys[p];
      keep({ keys });
    },
  };
});

/** The provider, key and model a call would use now — null when no key has been pasted. */
export function byokChoice(s: ByokSettings = useByok.getState()): { provider: AiProvider; key: string; model: string } | null {
  const key = (s.keys[s.provider] ?? '').trim();
  if (!key) return null;
  const model = s.models[s.provider] || PROVIDERS.find((p) => p.id === s.provider)!.defaultModel;
  return { provider: s.provider, key, model };
}

export function byokReady(): boolean {
  const c = byokChoice();
  return !!c && !!c.model;
}

function claudeClient(key: string, fetchImpl?: typeof fetch) {
  // The writer's own key, used from their own browser: the SDK calls this "dangerous" because a key in a page can be read
  // by that page — which here is the writer's own page on their own computer.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

function message(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The Claude key was not accepted — check it in AI key.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This Claude key is not allowed to use that model.';
  if (err instanceof Anthropic.NotFoundError) return 'That Claude model was not found for this key — pick another in AI key.';
  if (err instanceof Anthropic.RateLimitError) return 'Claude is busy or the key is over its limit — try again in a minute.';
  if (err instanceof Anthropic.APIError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Models the pasted key can use, newest first where the provider says so. */
export async function listModels(provider: AiProvider, key: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string; label: string }[]> {
  if (provider === 'anthropic') {
    const out: { id: string; label: string }[] = [];
    for await (const m of claudeClient(key, fetchImpl).models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id });
    return out;
  }
  if (provider === 'openai') {
    const r = await fetchImpl('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(await providerError(r, 'OpenAI'));
    const j = (await r.json()) as { data?: { id: string; created?: number }[] };
    return (j.data ?? [])
      .filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id) && !/(audio|realtime|tts|transcribe|image|search|embedding|moderation)/i.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, label: m.id }));
  }
  const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new Error(await providerError(r, 'Gemini'));
  const j = (await r.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent') && /gemini/i.test(m.name) && !/(embedding|image|tts|aqa)/i.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name.replace(/^models\//, '') }));
}

async function providerError(r: Response, who: string): Promise<string> {
  let detail = '';
  try {
    const j = await r.json();
    detail = j?.error?.message || '';
  } catch { /* not JSON */ }
  if (r.status === 401 || r.status === 403) return `The ${who} key was not accepted${detail ? ` (${detail})` : ''} — check it in AI key.`;
  if (r.status === 429) return `${who} is busy or the key is over its limit — try again in a minute.`;
  return detail || `${who} answered ${r.status}.`;
}

/**
 * One question, one answer, on the writer's own key. `signal` stops it (the panel's Stop button).
 */
export async function byokAi(system: string, user: string, maxTokens: number, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<AiAnswer> {
  const choice = byokChoice();
  if (!choice) return { ok: false, text: '', error: 'No AI key yet — open AI key and paste one.' };
  if (!choice.model) return { ok: false, text: '', error: 'Pick a model in AI key first.' };
  try {
    if (choice.provider === 'anthropic') {
      // Streamed: long rewrites can run past what a single waiting request allows.
      const stream = claudeClient(choice.key, fetchImpl).beta.messages.stream({
        model: choice.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        betas: ['server-side-fallback-2026-07-01'],
        // If the chosen model declines for policy reasons, the server retries on its default fallback model.
        fallbacks: 'default',
      }, { signal });
      const msg = await stream.finalMessage();
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      if (msg.stop_reason === 'refusal') return { ok: false, text, error: 'Claude declined this request.' };
      if (msg.stop_reason === 'max_tokens' && !text.trim()) return { ok: false, text, error: 'The answer ran out of room — ask for a smaller part.' };
      return { ok: true, text };
    }
    if (choice.provider === 'openai') {
      const r = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${choice.key}` },
        body: JSON.stringify({
          model: choice.model,
          max_completion_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!r.ok) return { ok: false, text: '', error: await providerError(r, 'OpenAI') };
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return { ok: true, text: j.choices?.[0]?.message?.content ?? '' };
    }
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(choice.model)}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': choice.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!r.ok) return { ok: false, text: '', error: await providerError(r, 'Gemini') };
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { ok: true, text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('') };
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError') || err instanceof Anthropic.APIUserAbortError) {
      return { ok: false, text: '', cancelled: true };
    }
    return { ok: false, text: '', error: message(err) };
  }
}
