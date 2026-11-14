/**
 * The Kontroll bridge — SwissCirkus fork.
 *
 * Inside Kontroll this page runs in a web tab, which gives it no direct way
 * into the app. Kontroll and the page talk through a small mailbox instead,
 * the same one the Schedule app uses: the page keeps `window.__kScreen`,
 * queues a request there and logs "[kontroll-screen]"; Kontroll takes the
 * queue (`take()`), does the work, and answers each request through
 * `reply(id, data)`. On every load it also says `hello` with the assistant
 * models the writer can use.
 *
 * Requests: hello · ai {system,user,engine,maxTokens} · engine {engine} ·
 * doc {url} (a Google Doc's text, read with the writer's Google sign-in in
 * Kontroll) · open {url} (a link in a Kontroll web tab) · cancel.
 *
 * In a plain browser nobody answers: `inKontroll()` stays false and the
 * features that need Kontroll say so.
 */
import { create } from 'zustand';
import { pluginRegistry } from '../plugins/registry';

export interface KontrollEngine { id: string; label: string }
export interface KontrollHello {
  engines: KontrollEngine[];
  /** The Screenplay assistant role, or '' (= the overall assistant). */
  engine: string;
  /** The overall assistant, which an empty role uses. */
  fallback: string;
  docs?: boolean;
  open?: boolean;
}

interface BridgeState {
  hello: KontrollHello | null;
}

export const useKontrollBridge = create<BridgeState>(() => ({ hello: null }));

/** True once Kontroll has said hello on this page load. */
export function inKontroll(): boolean {
  return useKontrollBridge.getState().hello !== null;
}

type Request = { id?: string; kind: string } & Record<string, unknown>;
type Answer = Record<string, unknown>;

interface Mailbox {
  take(): Request[];
  reply(id: string, data: Answer): void;
  hello(info: KontrollHello): void;
}

declare global {
  interface Window { __kScreen?: Mailbox }
}

const SIGNAL = '[kontroll-screen]';
const queue: Request[] = [];
const waiting = new Map<string, (data: Answer) => void>();
let counter = 0;

function nextId(): string {
  counter += 1;
  return `ks${Date.now().toString(36)}${counter}`;
}

/** Normalise what Kontroll sends in hello (it is another program's data). */
export function readHello(raw: unknown): KontrollHello | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const engines = (Array.isArray(r.engines) ? r.engines : [])
    .map((e) => (e && typeof e === 'object' ? e as Record<string, unknown> : {}))
    .filter((e) => typeof e.id === 'string' && e.id)
    .map((e) => ({ id: String(e.id), label: typeof e.label === 'string' && e.label ? e.label : String(e.id) }));
  return {
    engines,
    engine: typeof r.engine === 'string' ? r.engine : '',
    fallback: typeof r.fallback === 'string' ? r.fallback : '',
    docs: r.docs === true,
    open: r.open === true,
  };
}

function post(req: Request): void {
  queue.push(req);
  // Kontroll watches the tab's console for this exact line.
  console.log(SIGNAL);
}

/** Send a request and wait for Kontroll's answer. */
function ask(kind: string, payload: Record<string, unknown>, timeoutMs: number): Promise<Answer> {
  const id = nextId();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    waiting.set(id, (data) => { if (timer) clearTimeout(timer); resolve(data); });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ ok: false, error: 'Kontroll did not answer.' });
      }, timeoutMs);
    }
    post({ id, kind, ...payload });
  });
}

/** Install the mailbox (once) and ask Kontroll to say hello. Harmless in a browser. */
export function installKontrollBridge(): void {
  if (typeof window === 'undefined' || window.__kScreen) return;
  window.__kScreen = {
    take: () => queue.splice(0),
    reply: (id, data) => {
      const done = waiting.get(String(id));
      if (!done) return;
      waiting.delete(String(id));
      done(data && typeof data === 'object' ? data : {});
    },
    hello: (info) => {
      const hello = readHello(info);
      if (!hello) return;
      useKontrollBridge.setState({ hello });
      autoEnableAssistant();
    },
  };
  post({ kind: 'hello' });
}

const ASSISTANT_ID = 'script-assistant';
const AUTO_KEY = 'swisscirkus:script-assistant:auto-enabled';

/**
 * Inside Kontroll the Script Assistant is turned on for the writer the first
 * time — once: the choice is remembered, so turning it off in Settings ›
 * Add-ons keeps it off. The add-on registers once translations are ready,
 * which can be after Kontroll's hello, so this waits for it.
 */
export function autoEnableAssistant(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): void {
  if (!storage) return;
  try { if (storage.getItem(AUTO_KEY)) return; } catch { return; }
  const tryNow = (): boolean => {
    if (!pluginRegistry.getAddOns().some((p) => p.id === ASSISTANT_ID)) return false;
    try { storage.setItem(AUTO_KEY, '1'); } catch { /* private mode: it is asked again next time */ }
    if (!pluginRegistry.isAddOnEnabled(ASSISTANT_ID)) {
      pluginRegistry.enableAddOn(ASSISTANT_ID).catch((err) => console.warn('[kontroll] Script Assistant could not be turned on', err));
    }
    return true;
  };
  if (tryNow()) return;
  const off = pluginRegistry.subscribe(() => { if (tryNow()) off(); });
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export interface AiAnswer { ok: boolean; text: string; error: string; cancelled: boolean; engine: string }

/** Run one prompt on Kontroll's assistant models. No time limit: long rewrites take minutes. */
export async function kontrollAi(system: string, user: string, engine: string, maxTokens?: number): Promise<AiAnswer> {
  const a = await ask('ai', { system, user, engine, ...(maxTokens ? { maxTokens } : {}) }, 0);
  return {
    ok: a.ok === true,
    text: typeof a.text === 'string' ? a.text : '',
    error: typeof a.error === 'string' ? a.error : '',
    cancelled: a.cancelled === true,
    engine: typeof a.engine === 'string' ? a.engine : engine,
  };
}

export function kontrollCancel(): void {
  post({ kind: 'cancel' });
}

/** Make `engine` the Screenplay assistant role in Kontroll ('' = the overall assistant). */
export async function kontrollSetEngine(engine: string): Promise<void> {
  await ask('engine', { engine }, 10_000);
  const hello = useKontrollBridge.getState().hello;
  if (hello) useKontrollBridge.setState({ hello: { ...hello, engine } });
}

export interface DocAnswer { ok: boolean; text: string; title: string; words: number; needSignIn: boolean; error: string }

/** A Google Doc's text, read by Kontroll with the writer's Google sign-in. */
export async function kontrollReadDoc(url: string): Promise<DocAnswer> {
  const a = await ask('doc', { url }, 60_000);
  return {
    ok: a.ok === true,
    text: typeof a.text === 'string' ? a.text : '',
    title: typeof a.title === 'string' ? a.title : '',
    words: typeof a.words === 'number' ? a.words : 0,
    needSignIn: a.needSignIn === true,
    error: typeof a.error === 'string' ? a.error : '',
  };
}

export interface KontrollVoice { id: string; name: string; lang: string; gender?: 'female' | 'male'; detail?: string }

/** Kontroll's local voices for Table Read: Kokoro's, plus Kitten TTS 2's and Pocket TTS's when installed. */
export async function kontrollVoices(): Promise<{ ok: boolean; voices: KontrollVoice[]; error: string }> {
  const a = await ask('voices', {}, 30_000);
  const voices = (Array.isArray(a.voices) ? a.voices : [])
    .map((v) => (v && typeof v === 'object' ? v as Record<string, unknown> : {}))
    .filter((v) => typeof v.id === 'string' && /^[a-z0-9]+:.+/.test(v.id))
    .map((v) => ({
      id: String(v.id),
      name: typeof v.name === 'string' && v.name ? v.name : String(v.id),
      lang: typeof v.lang === 'string' ? v.lang : '',
      ...(v.gender === 'female' || v.gender === 'male' ? { gender: v.gender } : {}),
      ...(typeof v.detail === 'string' && v.detail ? { detail: v.detail } : {}),
    } as KontrollVoice));
  return { ok: a.ok === true && voices.length > 0, voices, error: typeof a.error === 'string' ? a.error : '' };
}

/** One line in a Kontroll voice ("kokoro:af_heart", "pocket:alba"…) → a base64 WAV. Local models can take a while. */
export async function kontrollSpeak(voice: string, text: string, rate = 1): Promise<{ ok: boolean; base64: string; mime: string; error: string }> {
  const a = await ask('tts', { voice, text, rate }, 5 * 60_000);
  return {
    ok: a.ok === true && typeof a.base64 === 'string' && a.base64.length > 0,
    base64: typeof a.base64 === 'string' ? a.base64 : '',
    mime: typeof a.mime === 'string' && a.mime ? a.mime : 'audio/wav',
    error: typeof a.error === 'string' && a.error ? a.error : 'Kontroll sent no audio.',
  };
}

/** Open a link in a Kontroll web tab. Resolves false when Kontroll refused it. */
export async function kontrollOpen(url: string): Promise<boolean> {
  const a = await ask('open', { url }, 10_000);
  return a.ok === true;
}
