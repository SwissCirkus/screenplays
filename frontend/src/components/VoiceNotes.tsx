/**
 * Voice notes into a Google Doc (SwissCirkus fork, Christian 2026-11-15: "I just have a … button and I can start dictating
 * and talking as it takes notes into a Google Doc"). Press the mic and talk: each finished piece of speech is added to the
 * end of the Doc as you go (in a browser with speech recognition), or when you stop (Kontroll's dictation, or the key
 * fallback). The Doc is the one open where the script is, or a new "Voice notes" Doc made here and opened beside the
 * script, so you can watch it fill up.
 * English only on purpose: this exists only on the SwissCirkus fork. // i18n-ignore
 */
import React, { useEffect, useRef, useState } from 'react';
import { FaMicrophone, FaStop, FaTimes } from 'react-icons/fa';
import { useDocView } from '../stores/docViewStore';
import { appendToDocAnyAccess, createBlankDoc } from '../services/googleDocsAccess';
import { ensureUnfiled } from '../services/unfiled';
import { addProjectLink } from '../services/projectLinks';
import { inKontroll, kontrollMic, useKontrollBridge } from '../services/kontrollBridge';
import { dictationMode, startDictation, type Dictation } from '../services/browserDictation';
import { voiceNotesTitle } from './voiceNotesTitle';
import './VoiceNotes.css';

import { useVoiceNotes } from './voiceNotesStore';

const VoiceNotes: React.FC = () => {
  const open = useVoiceNotes((s) => s.open);
  const setOpen = useVoiceNotes((s) => s.setOpen);
  const shownDoc = useDocView((s) => s.doc);
  const [target, setTarget] = useState<{ url: string; name: string } | null>(null);
  const [state, setState] = useState<'off' | 'on' | 'writing'>('off');
  const [heard, setHeard] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [levels, setLevels] = useState<number[] | null>(null);
  const dict = useRef<Dictation | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const kontrollSession = useRef(false);
  const kLevels = useKontrollBridge((s) => s.micLevels);

  // The Doc open on screen is the one written into, unless one was picked here.
  const doc = target ?? shownDoc;

  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  // Each piece goes to the end of the Doc, one after another, in the order spoken.
  const write = (text: string) => {
    const piece = text.trim();
    const into = docRef.current;
    if (!piece || !into) return;
    queue.current = queue.current.then(async () => {
      try {
        await appendToDocAnyAccess(into.url, piece);
        setAdded((prev) => [...prev.slice(-3), piece]);
        setProblem('');
      } catch (err) {
        setProblem(err instanceof Error ? err.message : String(err));
      }
    });
  };

  // Kontroll: its own dictation — the words arrive when you stop (or as you speak with live cloud dictation).
  const writeRef = useRef(write);
  useEffect(() => { writeRef.current = write; });
  useEffect(() => useKontrollBridge.subscribe((st, prev) => {
    if (!kontrollSession.current) return;
    if (st.dictation !== prev.dictation && st.dictation !== null) setHeard(st.dictation);
    if (st.micOn && !prev.micOn) setState('on');
    if (!st.micOn && prev.micOn) {
      kontrollSession.current = false;
      setState('off');
      writeRef.current(st.dictation ?? '');
      setHeard('');
    }
  }), []);

  useEffect(() => () => { dict.current?.stop(); }, []);
  if (!open) return null;

  const newDoc = async () => {
    try {
      const made = await createBlankDoc(voiceNotesTitle(new Date()));
      const unfiled = await ensureUnfiled();
      await addProjectLink(unfiled.id, made.url, made.name, 'Google Doc');
      window.dispatchEvent(new CustomEvent('screenplays:library-changed'));
      setTarget({ url: made.url, name: made.name });
      // Beside the script, so you can watch the notes come in.
      useDocView.getState().setSplit(true);
      useDocView.getState().show(made.url, made.name);
      setProblem('');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const toggle = async () => {
    if (!doc) return;
    if (inKontroll()) {
      if (state === 'on') { kontrollMic(false); setState('writing'); return; }
      kontrollSession.current = true;
      setHeard('');
      kontrollMic(true, '');
      return;
    }
    if (dict.current) { dict.current.stop(); return; }
    try {
      dict.current = await startDictation({
        onText: (text) => setHeard(text),
        onChunk: (piece) => write(piece),
        onLevels: setLevels,
        onTranscribing: () => setState('writing'),
        onEnd: (error) => { dict.current = null; setState('off'); setHeard(''); if (error) setProblem(error); },
      });
      setState('on');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const meter = inKontroll() ? kLevels : levels;
  const canDictate = inKontroll() || dictationMode() !== null;

  return (
    <div className="vn-panel" role="dialog" aria-label="Voice notes">
      <div className="vn-head">
        <span className="vn-title"><FaMicrophone /> {'Voice notes' /* i18n-ignore */}</span>
        <button type="button" className="vn-icon" title="Close" aria-label="Close" disabled={state === 'on'} onClick={() => setOpen(false)}><FaTimes /></button>
      </div>
      <div className="vn-into">
        {doc ? <>{'Into: ' /* i18n-ignore */}<strong title={doc.url}>{doc.name}</strong></> : 'Pick a Doc to write into:' /* i18n-ignore */}
        <button type="button" className="vn-link" onClick={() => void newDoc()} disabled={state !== 'off'}>{'New Doc' /* i18n-ignore */}</button>
        {target && shownDoc && shownDoc.url !== target.url && (
          <button type="button" className="vn-link" onClick={() => setTarget(null)} disabled={state !== 'off'}>{`Use “${shownDoc.name}”` /* i18n-ignore */}</button>
        )}
      </div>
      <div className="vn-controls">
        <button
          type="button"
          className={`vn-mic${state === 'on' ? ' live' : ''}`}
          onClick={() => void toggle()}
          disabled={!doc || !canDictate || state === 'writing'}
          title={!doc ? 'Pick a Doc first' : !canDictate ? 'Dictating needs Chrome or Edge, or an OpenAI or Gemini key in the Script Assistant’s key box' : state === 'on' ? 'Stop' : 'Start talking'}
          aria-pressed={state === 'on'}
        >
          {state === 'on' ? <FaStop /> : <FaMicrophone />}
        </button>
        {state === 'on' && (
          <span className="vn-meter" role="img" aria-label="Listening">
            {(meter ?? Array(9).fill(0)).map((v, i) => <span key={i} style={{ height: `${Math.max(8, Math.round(v * 100))}%` }} />)}
          </span>
        )}
        <span className="vn-status">
          {state === 'on' ? 'Listening — each sentence goes into the Doc' : state === 'writing' ? 'Writing it out…' : doc ? 'Press the mic and talk' : ''}{/* i18n-ignore */}
        </span>
      </div>
      {heard && <div className="vn-heard">{heard}</div>}
      {added.length > 0 && (
        <div className="vn-added">
          {added.map((a, i) => <div key={i}>{'✓ '}{a}</div>)}
        </div>
      )}
      {problem && <div className="vn-problem" role="alert">{problem}</div>}
    </div>
  );
};

export default VoiceNotes;
