/**
 * Dictation in a plain browser (SwissCirkus fork, Christian 2026-11-15: "add a mic to it … a simple version"). Inside
 * Kontroll, Kontroll's own dictation is used instead (kontrollMic).
 *
 *  - Chrome, Edge, Safari: the browser's own speech recognition — words appear while you speak (Chrome and Edge send the
 *    audio to Google / Microsoft to recognise it). Free, no key.
 *  - Elsewhere (Firefox…): it records, and on stop the recording is written out with the writer's own OpenAI or Gemini key
 *    (the one pasted for the Script Assistant). A Claude key can't do this — Anthropic has no speech-to-text.
 * Either way a live level comes back (nine bars, 0–1) so the writer sees it listening.
 */
import { useByok } from './byokAi';

export interface DictationHandlers {
  /** Everything heard so far in this session (finished words plus the words still being recognised). */
  onText(text: string): void;
  /** A finished piece of speech (a sentence or pause), for whoever writes chunks somewhere (voice notes). */
  onChunk?(text: string): void;
  onLevels?(levels: number[] | null): void;
  /** It stopped — on its own, after stop(), or with an error to show. */
  onEnd?(error?: string): void;
  /** Recording is being written out (the key fallback, after stop). */
  onTranscribing?(): void;
}

export interface Dictation { stop(): void; mode: 'live' | 'key' }

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Which way this browser can dictate now, or null (with the reason shown on the mic). */
export function dictationMode(): 'live' | 'key' | null {
  if (recognitionClass()) return 'live';
  const s = useByok.getState();
  if ((s.keys.openai && s.keys.openai.trim()) || (s.keys.gemini && s.keys.gemini.trim())) return 'key';
  return null;
}

/** The microphone's level, nine bars, until stopped. */
async function levelMeter(onLevels?: (l: number[] | null) => void): Promise<{ stream: MediaStream; stop(): void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (!onLevels) return { stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let last = 0;
  let raf = 0;
  const draw = (now: number) => {
    if (now - last > 80) {
      last = now;
      analyser.getByteFrequencyData(data);
      onLevels(Array.from({ length: 9 }, (_, i) => data[Math.floor((i * data.length) / 9)] / 255));
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return {
    stream,
    stop: () => { cancelAnimationFrame(raf); onLevels(null); try { void ctx.close(); } catch { /* closed */ } stream.getTracks().forEach((t) => t.stop()); },
  };
}

/** Start dictating. Throws when there's no way to (no recognition and no OpenAI/Gemini key) or the mic is refused. */
export async function startDictation(h: DictationHandlers): Promise<Dictation> {
  const mode = dictationMode();
  if (!mode) throw new Error('This browser has no speech recognition. Use Chrome or Edge, or add an OpenAI or Gemini key in the Script Assistant’s key box.');
  const meter = await levelMeter(h.onLevels);

  if (mode === 'live') {
    const Rec = recognitionClass()!;
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    let finished = '';
    let stopped = false;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const said = r[0]?.transcript ?? '';
        if (r.isFinal) { finished = joinWords(finished, said); h.onChunk?.(said.trim()); } else interim = joinWords(interim, said);
      }
      h.onText(joinWords(finished, interim));
    };
    let failure = '';
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') failure = e.error === 'not-allowed' ? 'The microphone was not allowed' : `Speech recognition stopped (${e.error})`; };
    // Browsers end a session after a pause: keep it going until the writer stops it.
    rec.onend = () => {
      if (!stopped && !failure) { try { rec.start(); return; } catch { /* fall through */ } }
      meter.stop();
      h.onEnd?.(failure || undefined);
    };
    rec.start();
    return { mode, stop: () => { stopped = true; try { rec.stop(); } catch { /* stopped */ } } };
  }

  // Record, then write it out with the writer's own key.
  const chunks: Blob[] = [];
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const recorder = new MediaRecorder(meter.stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    meter.stop();
    h.onTranscribing?.();
    try {
      const text = await transcribeWithKey(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }));
      h.onText(text);
      if (text.trim()) h.onChunk?.(text.trim());
      h.onEnd?.();
    } catch (err) {
      h.onEnd?.(err instanceof Error ? err.message : String(err));
    }
  };
  recorder.start();
  return { mode, stop: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
}

function joinWords(a: string, b: string): string {
  const x = a.trim(), y = b.trim();
  return x && y ? `${x} ${y}` : x || y;
}

/** A recording → text, on the writer's OpenAI key (Whisper) or Gemini key. */
export async function transcribeWithKey(audio: Blob, fetchImpl: typeof fetch = fetch): Promise<string> {
  const s = useByok.getState();
  const openai = s.keys.openai?.trim();
  if (openai) {
    const form = new FormData();
    form.append('file', audio, `speech.${audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'm4a' : 'webm'}`);
    form.append('model', 'whisper-1');
    const r = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openai}` }, body: form });
    if (!r.ok) throw new Error(`OpenAI couldn't write it out (${r.status})`);
    return String(((await r.json()) as { text?: string }).text ?? '');
  }
  const gemini = s.keys.gemini?.trim();
  if (gemini) {
    const model = s.models.gemini || 'gemini-2.5-flash';
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gemini },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audio.type || 'audio/webm', data: b64 } }, { text: 'Write out exactly what is said in this recording, as plain text. Nothing else.' }] }] }),
    });
    if (!r.ok) throw new Error(`Gemini couldn't write it out (${r.status})`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  }
  throw new Error('Add an OpenAI or Gemini key in the Script Assistant’s key box to dictate in this browser');
}
