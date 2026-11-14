/**
 * Script Assistant — the right-hand panel that reads the whole script and
 * changes it on request, on Kontroll's own AI models.
 *
 * The writer asks in plain words ("apply the notes in the attached doc",
 * "turn this outline into scenes", "tighten scene 4"). The panel sends the
 * script (as Fountain, by numbered scene), any Google Docs attached — read
 * fresh by Kontroll with the writer's Google sign-in — and the request. The
 * model answers with a reply and a list of scene-level edits; each edit is
 * shown with what it touches and its new text, and nothing reaches the script
 * until the writer ticks the ones they want and presses Apply. Applied edits
 * land as one editor change, so one undo takes them all back.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { FaMagic, FaMicrophone, FaPaperPlane, FaStop, FaTrashAlt, FaPaperclip, FaTimes } from 'react-icons/fa';
import {
  inKontroll, kontrollAi, kontrollCancel, kontrollMic, kontrollReadDoc, kontrollSetEngine, useKontrollBridge,
} from '../../services/kontrollBridge';
import { api } from '../../services/api';
import { readProjectLink, openLinkInNewTab, type ProjectAsset } from '../../services/projectLinks';
import { useProjectStore } from '../../stores/projectStore';
import { isLinkAsset, linkDisplayName, linkKind, normalizeLinkUrl } from '../../utils/linkAssets';
import {
  applyOrder, editPreview, parseAssistantReply, planEdits, sceneSignature, scriptForModel, scriptLayout,
  type AssistantEdit, type BlockRange, type PlannedEdit,
} from './scriptEdits';
import { SYSTEM_PROMPT, buildUserPrompt, type AttachedDoc, type Exchange } from './prompt';
import './scriptAssistant.css';

interface Props { editor: Editor | null }

interface UiMessage { id: number; role: 'user' | 'assistant' | 'error'; content: string }
interface DocRef { url: string; name: string; /** Pasted by hand: named after the Doc's first line once read. */ pasted?: boolean }
interface Proposal {
  planned: PlannedEdit[];
  chosen: boolean[];
  problems: string[];
  /** Scene headings when the question was asked: a script that changed shape since must not take these edits. */
  signature: string;
}

const MAX_TOKENS = 32000;
const HISTORY_TURNS = 6;

let counter = 0;
const nextId = () => { counter += 1; return counter; };

/** Where the writer is: the selected elements, the element after the cursor, and the cursor's scene. */
function editorPlace(editor: Editor): { selection: BlockRange | null; cursor: number; cursorScene: number | null; selectedText: string | null } {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const fromIndex = state.doc.resolve(from).index(0);
  let selection: BlockRange | null = null;
  let selectedText: string | null = null;
  if (!empty) {
    const $to = state.doc.resolve(to);
    const toIndex = $to.parentOffset === 0 && $to.depth > 0 && to > from ? $to.index(0) : $to.index(0) + 1;
    selection = { start: fromIndex, end: Math.max(fromIndex + 1, toIndex) };
    selectedText = state.doc.textBetween(from, to, '\n').trim() || null;
  }
  const layout = scriptLayout(editor.getJSON());
  const scene = layout.scenes.find((s) => fromIndex >= s.start && fromIndex < s.end);
  return { selection, cursor: Math.min(fromIndex + 1, state.doc.childCount), cursorScene: scene ? scene.number : null, selectedText };
}

const ScriptAssistantPanel: React.FC<Props> = ({ editor }) => {
  const { t } = useTranslation('addons');
  const hello = useKontrollBridge((s) => s.hello);
  const micOn = useKontrollBridge((s) => s.micOn);
  const dictation = useKontrollBridge((s) => s.dictation);
  const currentProject = useProjectStore((s) => s.currentProject);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  // Kontroll's dictation sends the box's whole text as it hears it.
  useEffect(() => { if (dictation !== null) setInput(dictation); }, [dictation]);
  // Closing the panel stops a mic that is still recording.
  useEffect(() => () => { if (useKontrollBridge.getState().micOn) kontrollMic(false); }, []);
  const [busy, setBusy] = useState<null | 'docs' | 'model'>(null);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const [projectDocs, setProjectDocs] = useState<DocRef[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stoppedRef = useRef(false);

  // The open project's Google Docs, for the Attach menu.
  useEffect(() => {
    if (!currentProject) return;
    let live = true;
    void (async () => {
      try {
        const assets = (await api.listAssets(currentProject.id)) as ProjectAsset[];
        const found: DocRef[] = [];
        for (const a of assets.filter(isLinkAsset)) {
          const url = await readProjectLink(currentProject.id, a);
          if (url && linkKind(url) === 'gdoc') found.push({ url, name: linkDisplayName(a) });
        }
        if (live) setProjectDocs(found);
      } catch {
        if (live) setProjectDocs([]);
      }
    })();
    return () => { live = false; };
  }, [currentProject, attachOpen]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, proposal, busy]);

  const say = useCallback((role: UiMessage['role'], content: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role, content }]);
  }, []);

  const attach = (doc: DocRef) => {
    setDocs((prev) => (prev.some((d) => d.url === doc.url) ? prev : [...prev, doc]));
    setAttachOpen(false);
  };

  const attachPasted = () => {
    const url = normalizeLinkUrl(pasteUrl);
    if (!url || linkKind(url) !== 'gdoc') { say('error', t('scriptAssistant.notADoc')); return; }
    attach({ url, name: t('scriptAssistant.pastedDoc'), pasted: true });
    setPasteUrl('');
  };

  const engineLabel = useMemo(() => {
    if (!hello) return '';
    const id = hello.engine || hello.fallback;
    return hello.engines.find((e) => e.id === id)?.label ?? id;
  }, [hello]);

  const send = useCallback(async (text?: string) => {
    const request = (text ?? input).trim();
    if (!request || !editor || busy) return;
    if (!inKontroll()) { say('error', t('scriptAssistant.needsKontroll')); return; }
    setInput('');
    setProposal(null);
    stoppedRef.current = false;
    say('user', request);

    // Every ask reads the attached Docs again, so the newest notes are used.
    const read: AttachedDoc[] = [];
    if (docs.length) {
      setBusy('docs');
      for (const d of docs) {
        const r = await kontrollReadDoc(d.url);
        if (!r.ok) {
          say('error', r.needSignIn ? t('scriptAssistant.docSignIn', { name: d.name }) : t('scriptAssistant.docFailed', { name: d.name, message: r.error }));
          setBusy(null);
          return;
        }
        const name = d.pasted && r.title ? r.title : d.name;
        if (name !== d.name) setDocs((prev) => prev.map((x) => (x.url === d.url ? { ...x, name, pasted: false } : x)));
        read.push({ name, url: d.url, text: r.text });
      }
    }

    const doc = editor.getJSON();
    const place = editorPlace(editor);
    const history: Exchange[] = messages
      .filter((m) => m.role !== 'error')
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role as Exchange['role'], content: m.content }));
    const user = buildUserPrompt({
      request, script: scriptForModel(doc), docs: read, history,
      cursorScene: place.cursorScene, selection: place.selectedText,
    });

    setBusy('model');
    const answer = await kontrollAi(SYSTEM_PROMPT, user, hello?.engine ?? '', MAX_TOKENS);
    setBusy(null);
    if (stoppedRef.current || answer.cancelled) { say('error', t('scriptAssistant.stopped')); return; }
    if (!answer.ok) { say('error', t('scriptAssistant.failed', { message: answer.error || '?' })); return; }

    const reply = parseAssistantReply(answer.text);
    say('assistant', reply.reply || (reply.edits.length ? t('scriptAssistant.proposalReady') : t('scriptAssistant.noAnswer')));
    if (reply.edits.length) {
      const plan = planEdits(doc, reply.edits, { selection: place.selection, cursor: place.cursor });
      if (plan.planned.length) {
        setProposal({ planned: plan.planned, chosen: plan.planned.map(() => true), problems: plan.problems, signature: sceneSignature(doc) });
      } else {
        say('error', t('scriptAssistant.nothingApplicable', { problems: plan.problems.join('; ') }));
      }
    }
  }, [input, editor, busy, docs, messages, hello, say, t]);

  const stop = () => { stoppedRef.current = true; kontrollCancel(); };

  const apply = () => {
    if (!editor || !proposal) return;
    if (!editor.isEditable) { say('error', t('scriptAssistant.readOnly')); return; }
    const current = editor.getJSON();
    if (sceneSignature(current) !== proposal.signature) { say('error', t('scriptAssistant.changedSince')); setProposal(null); return; }
    const chosen = proposal.planned.filter((_, i) => proposal.chosen[i]);
    if (!chosen.length) return;
    const { state } = editor;
    const starts: number[] = [];
    state.doc.forEach((_node, offset) => { starts.push(offset); });
    starts.push(state.doc.content.size);
    const tr = state.tr;
    try {
      for (const p of applyOrder(chosen)) {
        const nodes = p.content.map((json) => state.schema.nodeFromJSON(json));
        if (nodes.length) tr.replaceWith(starts[p.start], starts[p.end], nodes);
        else tr.delete(starts[p.start], starts[p.end]);
      }
      if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.action.create());
      editor.view.dispatch(tr.scrollIntoView());
      editor.commands.focus();
      say('assistant', t('scriptAssistant.applied'));
      setProposal(null);
    } catch (err) {
      say('error', t('scriptAssistant.applyFailed', { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  const editTitle = (edit: AssistantEdit, scenes: ReturnType<typeof scriptLayout>['scenes']): string => {
    const heading = edit.scene ? scenes.find((s) => s.number === edit.scene)?.heading : '';
    const suffix = heading ? ` · ${heading}` : '';
    switch (edit.op) {
      case 'replaceScene': return t('scriptAssistant.op.replaceScene', { n: edit.scene }) + suffix;
      case 'deleteScene': return t('scriptAssistant.op.deleteScene', { n: edit.scene }) + suffix;
      case 'insertAfterScene': return edit.scene === 0 ? t('scriptAssistant.op.insertAtStart') : t('scriptAssistant.op.insertAfterScene', { n: edit.scene }) + suffix;
      case 'replaceSelection': return t('scriptAssistant.op.replaceSelection');
      case 'insertAtCursor': return t('scriptAssistant.op.insertAtCursor');
      default: return t('scriptAssistant.op.replaceScript');
    }
  };

  const scenesNow = editor ? scriptLayout(editor.getJSON()).scenes : [];
  const examples = [t('scriptAssistant.examples.notes'), t('scriptAssistant.examples.outline'), t('scriptAssistant.examples.tighten')];

  return (
    <div className={`sa-panel${hello ? ' sa-in-kontroll' : ''}`}>
      <div className="sa-header">
        <span className="sa-title"><FaMagic /> {t('scriptAssistant.plugin.panel')}</span>
        <button
          type="button"
          className="sa-icon-btn"
          title={t('scriptAssistant.clear')}
          aria-label={t('scriptAssistant.clear')}
          disabled={!!busy || (!messages.length && !proposal)}
          onClick={() => { setMessages([]); setProposal(null); }}
        >
          <FaTrashAlt />
        </button>
      </div>

      {!hello && <div className="sa-notice">{t('scriptAssistant.needsKontroll')}</div>}

      <div className="sa-docs">
        {docs.map((d) => (
          <span key={d.url} className="sa-doc-chip" title={d.url}>
            <button type="button" className="sa-doc-name" onClick={() => openLinkInNewTab(d.url)}>{'📄'} {d.name}</button>
            <button
              type="button"
              className="sa-doc-remove"
              aria-label={t('scriptAssistant.attachRemove', { name: d.name })}
              title={t('scriptAssistant.attachRemove', { name: d.name })}
              onClick={() => setDocs((prev) => prev.filter((x) => x.url !== d.url))}
            >
              <FaTimes />
            </button>
          </span>
        ))}
        <button type="button" className="sa-attach-btn" onClick={() => setAttachOpen((o) => !o)} aria-expanded={attachOpen}>
          <FaPaperclip /> {t('scriptAssistant.attach')}
        </button>
      </div>
      {attachOpen && (
        <div className="sa-attach-menu">
          {projectDocs.length === 0 && <div className="sa-attach-empty">{t('scriptAssistant.attachNone')}</div>}
          {projectDocs.map((d) => (
            <button key={d.url} type="button" className="sa-attach-item" onClick={() => attach(d)} disabled={docs.some((x) => x.url === d.url)}>
              {'📄'} {d.name}
            </button>
          ))}
          <form className="sa-attach-paste" onSubmit={(e) => { e.preventDefault(); attachPasted(); }}>
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder={t('scriptAssistant.attachPaste')}
              aria-label={t('scriptAssistant.attachPaste')}
            />
            <button type="submit" disabled={!pasteUrl.trim()}>{t('scriptAssistant.attachAdd')}</button>
          </form>
        </div>
      )}

      <div className="sa-messages" ref={listRef}>
        {messages.length === 0 && !busy && (
          <div className="sa-empty">
            {examples.map((ex) => (
              <button key={ex} type="button" className="sa-example" disabled={!hello} onClick={() => void send(ex)}>{ex}</button>
            ))}
            {hello && <p className="sa-hint">{t('scriptAssistant.hint', { name: engineLabel })}</p>}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`sa-message sa-${m.role}`}>
            {m.role !== 'error' && <div className="sa-role">{m.role === 'user' ? t('scriptAssistant.you') : t('scriptAssistant.assistant')}</div>}
            <div className="sa-text">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="sa-message sa-assistant">
            <div className="sa-text sa-thinking">{busy === 'docs' ? t('scriptAssistant.readingDocs') : t('scriptAssistant.thinking', { name: engineLabel })}</div>
          </div>
        )}
        {proposal && (
          <div className="sa-proposal">
            <div className="sa-proposal-title">{t('scriptAssistant.proposal')}</div>
            {proposal.planned.map((p, i) => (
              <details key={i} className="sa-edit" open={proposal.planned.length <= 3}>
                <summary>
                  <input
                    type="checkbox"
                    checked={proposal.chosen[i]}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setProposal((prev) => prev && { ...prev, chosen: prev.chosen.map((c, j) => (j === i ? on : c)) });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={editTitle(p.edit, scenesNow)}
                  />
                  <span>{editTitle(p.edit, scenesNow)}</span>
                </summary>
                {p.edit.op !== 'deleteScene' && <pre className="sa-edit-text">{editPreview(p.edit, 40)}</pre>}
              </details>
            ))}
            {proposal.problems.length > 0 && (
              <div className="sa-problems">{t('scriptAssistant.skipped', { problems: proposal.problems.join('; ') })}</div>
            )}
            <div className="sa-proposal-actions">
              <button type="button" className="sa-btn primary" onClick={apply} disabled={!proposal.chosen.some(Boolean)}>{t('scriptAssistant.apply')}</button>
              <button type="button" className="sa-btn" onClick={() => setProposal(null)}>{t('scriptAssistant.discard')}</button>
            </div>
          </div>
        )}
      </div>

      {/* SwissCirkus (Christian 2026-11-14): the model sits right above the box; the box is full width; mic and Send sit under it,
          and in Kontroll the whole block stays clear of Kontroll's ? and chat buttons in the bottom-right corner. */}
      <form className="sa-input" onSubmit={(e) => { e.preventDefault(); if (micOn) kontrollMic(false); void send(); }}>
        {hello && (
          <label className="sa-model">
            <span>{t('scriptAssistant.model')}</span>
            <select
              value={hello.engine}
              disabled={!!busy}
              onChange={(e) => { void kontrollSetEngine(e.target.value); }}
            >
              <option value="">{t('scriptAssistant.modelDefault', { name: hello.engines.find((e) => e.id === hello.fallback)?.label ?? hello.fallback })}</option>
              {hello.engines.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (micOn) kontrollMic(false); void send(); } }}
          placeholder={t('scriptAssistant.placeholder')}
          aria-label={t('scriptAssistant.placeholder')}
          rows={5}
          disabled={!hello}
        />
        <div className="sa-input-actions">
          {hello?.mic && (
            <button
              type="button"
              className={`sa-mic${micOn ? ' live' : ''}`}
              onClick={() => kontrollMic(!micOn, input)}
              disabled={!!busy}
              title={micOn ? 'Stop dictating' : 'Dictate — talk instead of typing (Kontroll records)'} // i18n-ignore: Kontroll-only
              aria-label={micOn ? 'Stop dictating' : 'Dictate'} // i18n-ignore: Kontroll-only
              aria-pressed={micOn}
            >
              <FaMicrophone />
            </button>
          )}
          {busy === 'model' ? (
            <button type="button" className="sa-send stop" onClick={stop} title={t('scriptAssistant.stop')}><FaStop /> {t('scriptAssistant.stop')}</button>
          ) : (
            <button type="submit" className="sa-send" disabled={!input.trim() || !!busy || !hello} title={t('scriptAssistant.send')}><FaPaperPlane /> {t('scriptAssistant.send')}</button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ScriptAssistantPanel;
