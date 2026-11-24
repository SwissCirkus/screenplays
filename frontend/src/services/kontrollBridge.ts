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
 * Kontroll) · open {url} (a link in a Kontroll web tab) · story {title,
 * fountain} (the script into Story Builder) · cancel · result {rid, …} (the answer to
 * one of Kontroll's commands — kontrollCommands.ts).
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
  /** Kontroll takes a script into Story Builder (File › Send to Kontroll Story Builder). */
  story?: boolean;
  /** Kontroll records the Script Assistant's mic (its own dictation) and types into the box. */
  mic?: boolean;
  /** Kontroll opens this page in the computer's web browser (the globe beside Assistant). */
  browser?: boolean;
}

interface BridgeState {
  hello: KontrollHello | null;
  /** Kontroll's mic is recording for the Script Assistant. */
  micOn: boolean;
  /** The box's text as Kontroll's dictation has it (null = nothing new). */
  dictation: string | null;
  /** The mic's live level while it records — nine bars, 0–1 (null = not recording). */
  micLevels: number[] | null;
  /** Stop was pressed: Kontroll is turning the recording into words. */
  micStopping: boolean;
}

export const useKontrollBridge = create<BridgeState>(() => ({ hello: null, micOn: false, dictation: null, micLevels: null, micStopping: false }));

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
  /** Kontroll's dictation: the box's whole text so far. */
  dictated(text: string): void;
  /** Kontroll's mic started (true) or stopped (false). */
  micState(on: boolean): void;
  /** The mic's live level (nine bars, 0–1), about 12 times a second while it records; null when it stops. */
  micLevel(levels: number[] | null): void;
  /** Kontroll drives the writer (Story Builder, 2026-11-20): a command; the answer comes back as a `result` request with this id. */
  command(id: string, name: string, args: Record<string, unknown>): void;
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
    story: r.story === true,
    mic: r.mic === true,
    browser: r.browser === true,
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
    dictated: (text) => { useKontrollBridge.setState({ dictation: typeof text === 'string' ? text : '' }); },
    micState: (on) => { useKontrollBridge.setState(on === true ? { micOn: true } : { micOn: false, micStopping: false, micLevels: null }); },
    micLevel: (levels) => {
      const ok = Array.isArray(levels) ? levels.slice(0, 16).map((v) => Math.max(0, Math.min(1, Number(v) || 0))) : null;
      useKontrollBridge.setState({ micLevels: ok });
    },
    command: (id, name, args) => {
      void import('./kontrollCommands')
        .then((m) => m.runKontrollCommand(String(name || ''), args && typeof args === 'object' ? args : {}))
        .catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }))
        .then((answer) => post({ kind: 'result', rid: String(id), ...answer }));
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

/**
 * Start (with the box's current text, which dictation continues) or stop Kontroll's mic. While it records, Kontroll
 * sends the box's whole text through `dictated`, and `micState` says when it starts and stops.
 */
export function kontrollMic(on: boolean, text = ''): void {
  if (on) useKontrollBridge.setState({ dictation: null, micStopping: false });
  else if (useKontrollBridge.getState().micOn) useKontrollBridge.setState({ micStopping: true, micLevels: null });
  post({ kind: 'mic', on, ...(on ? { text } : {}) });
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

export interface StoryAnswer { ok: boolean; scenes: number; story: string; error: string }

/**
 * Hand the script (Fountain text) to Kontroll's Story Builder: it becomes a new script revision of the open
 * project's story, ready for Breakdown. Nothing in the writer changes.
 */
export async function kontrollSendToStoryBuilder(title: string, fountain: string): Promise<StoryAnswer> {
  const a = await ask('story', { title, fountain }, 60_000);
  return {
    ok: a.ok === true,
    scenes: typeof a.scenes === 'number' ? a.scenes : 0,
    story: typeof a.story === 'string' ? a.story : '',
    error: typeof a.error === 'string' && a.error ? a.error : (a.ok === true ? '' : 'Kontroll could not take the script.'),
  };
}

/** Open this page (the writer's own address) in the computer's web browser. Resolves false when Kontroll refused it. */
export async function kontrollOpenInBrowser(url: string): Promise<boolean> {
  const a = await ask('browser', { url }, 10_000);
  return a.ok === true;
}

/** Open a link in a Kontroll web tab. Resolves false when Kontroll refused it. */
export async function kontrollOpen(url: string): Promise<boolean> {
  const a = await ask('open', { url }, 10_000);
  return a.ok === true;
}
