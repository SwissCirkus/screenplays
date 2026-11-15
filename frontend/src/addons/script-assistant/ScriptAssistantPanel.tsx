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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { FaGoogleDrive, FaKey, FaMagic, FaMicrophone, FaPaperPlane, FaStop, FaTrashAlt, FaPaperclip, FaTimes } from 'react-icons/fa';
import {
  inKontroll, kontrollAi, kontrollCancel, kontrollMic, kontrollReadDoc, kontrollSetEngine, useKontrollBridge,
} from '../../services/kontrollBridge';
import { api } from '../../services/api';
import { byokAi, byokChoice, useByok, CLAUDE_MODELS } from '../../services/byokAi';
import ByokSettings from './ByokSettings';
import { readProjectLink, openLinkInNewTab, type ProjectAsset } from '../../services/projectLinks';
import { useProjectStore } from '../../stores/projectStore';
import { isLinkAsset, linkDisplayName, linkKind, normalizeLinkUrl } from '../../utils/linkAssets';
import {
  applyOrder, editPreview, parseAssistantReply, planEdits, sceneSignature, scriptForModel, scriptLayout,
  type AssistantEdit, type BlockRange, type PlannedEdit,
} from './scriptEdits';
import { SYSTEM_PROMPT, buildUserPrompt, type AttachedDoc, type Exchange } from './prompt';
import {
  DOCS_OFF_PROMPT, DOCS_ON_PROMPT, MAX_DOC_ROUNDS, isLookup, isWrite, lookupResult, matchProject, parseDocActions,
  projectsForModel, type DocWrite,
} from './docTools';
import { addProjectLink } from '../../services/projectLinks';
import { useDocView } from '../../stores/docViewStore';
/** Same name as browserLibraryInit's LIBRARY_CHANGED_EVENT (kept here so the panel doesn't load the library's start-up). */
const LIBRARY_CHANGED_EVENT = 'screenplays:library-changed';
import {
  appendToDoc, createDoc, docIdOf, readDoc, replaceDocText, searchDocs, setUpDocsAccess, turnOffDocsAccess, useDocsAccess,
} from '../../services/googleDocsAccess';
import './scriptAssistant.css';

interface Props { editor: Editor | null }

interface UiMessage { id: number; role: 'user' | 'assistant' | 'error'; content: string; /** Show the Google Docs setup button under it. */ setup?: boolean }
interface DocProposal { writes: DocWrite[]; chosen: boolean[] }
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

/** The first 40 lines of a Doc change, for the list. */
const docPreview = (text: string) => { const lines = text.split(NL); return lines.slice(0, 40).join(NL) + (lines.length > 40 ? NL + '…' : ''); };
const NL = String.fromCharCode(10);

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
  const micLevels = useKontrollBridge((s) => s.micLevels);
  const micStopping = useKontrollBridge((s) => s.micStopping);
  const currentProject = useProjectStore((s) => s.currentProject);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  // Kontroll's dictation sends the box's whole text as it hears it.
  useEffect(() => { if (dictation !== null) setInput(dictation); }, [dictation]);
  // Closing the panel stops a mic that is still recording.
  useEffect(() => () => { if (useKontrollBridge.getState().micOn) kontrollMic(false); }, []);
  const [busy, setBusy] = useState<null | 'docs' | 'model' | 'lookup'>(null);
  // Google Docs access (Christian 2026-11-15): search and read on their own; every change to a Doc waits for Apply.
  const docsOn = useDocsAccess((s) => s.on);
  const docsMessage = useDocsAccess((s) => s.message);
  const [docProposal, setDocProposal] = useState<DocProposal | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const [projectDocs, setProjectDocs] = useState<DocRef[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stoppedRef = useRef(false);
  // Web version: the writer's own key (bring your own key). `aiReady` — a question can be asked now.
  const byokState = useByok();
  const byok = !hello ? byokChoice(byokState) : null;
  const aiReady = !!hello || (!!byok && !!byok.model);
  const [keyOpen, setKeyOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

  const say = useCallback((role: UiMessage['role'], content: string, setup = false) => {
    setMessages((prev) => [...prev, { id: nextId(), role, content, ...(setup ? { setup: true } : {}) }]);
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

  const engineLabel = (() => {
    if (!hello) return byok ? (CLAUDE_MODELS.find((m) => m.id === byok.model)?.label ?? byok.model) : '';
    const id = hello.engine || hello.fallback;
    return hello.engines.find((e) => e.id === id)?.label ?? id;
  })();

  const send = useCallback(async (text?: string) => {
    const request = (text ?? input).trim();
    if (!request || !editor || busy) return;
    if (!inKontroll() && !aiReady) { setKeyOpen(true); return; }
    setInput('');
    setProposal(null);
    setDocProposal(null);
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

    // The Google Doc open where the script is (Christian 2026-11-15: "make sure … the AI agent has got access to it") is
    // read with every ask too — through Kontroll's Google sign-in inside Kontroll, or Google Docs access in a browser.
    let openDocNote = '';
    const shown = useDocView.getState().doc;
    if (shown && !read.some((d) => d.url === shown.url)) {
      setBusy('docs');
      if (inKontroll()) {
        const r = await kontrollReadDoc(shown.url);
        if (r.ok) read.push({ name: `${r.title || shown.name} (open on screen)`, url: shown.url, text: r.text });
        else openDocNote = `The writer has the Google Doc "${shown.name}" open on screen, but it couldn't be read (${r.needSignIn ? 'not signed in to Google' : r.error}).`;
      } else if (useDocsAccess.getState().on) {
        try {
          const d = await readDoc(shown.url);
          read.push({ name: `${d.name} (open on screen)`, url: shown.url, text: d.text });
        } catch (err) {
          openDocNote = `The writer has the Google Doc "${shown.name}" open on screen, but it couldn't be read (${err instanceof Error ? err.message : String(err)}).`;
        }
      } else {
        openDocNote = `The writer has the Google Doc "${shown.name}" open on screen. It can't be read until Google Docs access is set up — if they ask about it, explain the setup and set "setup": true.`;
      }
      setBusy(null);
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

    // The writer's projects, so the assistant can name them (and attach Docs to them) — Christian 2026-11-15.
    let projectNames: string[] = [];
    try { projectNames = (await api.listProjects()).map((p) => p.name); } catch { /* no list: it asks instead */ }
    const docsHere = useDocsAccess.getState().on;
    const system = SYSTEM_PROMPT + '\n' + (docsHere ? DOCS_ON_PROMPT : DOCS_OFF_PROMPT);
    const askModel = async (prompt: string) => {
      if (inKontroll()) return kontrollAi(system, prompt, hello?.engine ?? '', MAX_TOKENS);
      const ctl = new AbortController();
      abortRef.current = ctl;
      const a = await byokAi(system, prompt, MAX_TOKENS, ctl.signal);
      abortRef.current = null;
      return a;
    };

    // Searches and reads in the writer's Google Docs run straight away and go back to the model, a few rounds at most.
    const found: string[] = [];
    let answer: { ok: boolean; text: string; error?: string; cancelled?: boolean } = { ok: false, text: '' };
    let docActs = parseDocActions('');
    for (let round = 0; ; round++) {
      setBusy('model');
      const withProjects = `${user}\n\n${projectsForModel(projectNames)}${openDocNote ? `\n${openDocNote}` : ''}`;
      const prompt = found.length ? `${withProjects}\n\nGOOGLE DOCS RESULTS (from your searches and reads):\n${found.join('\n\n')}` : withProjects;
      answer = await askModel(prompt);
      setBusy(null);
      if (stoppedRef.current || answer.cancelled) { say('error', t('scriptAssistant.stopped')); return; }
      if (!answer.ok) { say('error', t('scriptAssistant.failed', { message: answer.error || '?' })); return; }
      docActs = parseDocActions(answer.text);
      const lookups = docActs.actions.filter(isLookup);
      if (!lookups.length || !docsHere || round >= MAX_DOC_ROUNDS) break;
      setBusy('lookup');
      for (const a of lookups) {
        try {
          if (a.do === 'search') found.push(lookupResult(a, { hits: await searchDocs(a.query) }));
          else found.push(lookupResult(a, { doc: await readDoc(a.id) }));
        } catch (err) {
          found.push(lookupResult(a, { error: err instanceof Error ? err.message : String(err) }));
        }
        if (stoppedRef.current) { setBusy(null); say('error', t('scriptAssistant.stopped')); return; }
      }
    }

    const reply = parseAssistantReply(answer.text);
    const wantsSetup = !docsHere && (docActs.setup || docActs.actions.length > 0);
    say('assistant', reply.reply || (reply.edits.length ? t('scriptAssistant.proposalReady') : t('scriptAssistant.noAnswer')), wantsSetup);
    const writes = docsHere ? docActs.actions.filter(isWrite) : [];
    if (writes.length) setDocProposal({ writes, chosen: writes.map(() => true) });
    if (reply.edits.length) {
      const plan = planEdits(doc, reply.edits, { selection: place.selection, cursor: place.cursor });
      if (plan.planned.length) {
        setProposal({ planned: plan.planned, chosen: plan.planned.map(() => true), problems: plan.problems, signature: sceneSignature(doc) });
      } else {
        say('error', t('scriptAssistant.nothingApplicable', { problems: plan.problems.join('; ') }));
      }
    }
  }, [input, editor, busy, docs, messages, hello, aiReady, say, t]);

  const applyDocs = async () => {
    if (!docProposal) return;
    const chosen = docProposal.writes.filter((_, i) => docProposal.chosen[i]);
    if (!chosen.length) return;
    setDocProposal(null);
    setBusy('lookup');
    let projects: { id: string; name: string }[] = [];
    if (chosen.some((w) => w.do === 'link')) { try { projects = await api.listProjects(); } catch { /* reported per link below */ } }
    let linked = false;
    for (const w of chosen) {
      const name = w.do === 'create' ? w.title : (w.name || w.id);
      try {
        if (w.do === 'link') {
          const project = matchProject(projects, w.project);
          if (!project) throw new Error(`there's no project called “${w.project}”`); // i18n-ignore: SwissCirkus fork
          await addProjectLink(project.id, `https://docs.google.com/document/d/${docIdOf(w.id)}/edit`, w.name || '', 'Google Doc');
          linked = true;
          say('assistant', `Attached “${name}” to ${project.name} (under Google Docs & links).`); // i18n-ignore: SwissCirkus fork
        } else if (w.do === 'create') {
          const made = await createDoc(w.title, w.text);
          say('assistant', `Made the Google Doc “${made.name}”: ${made.url}`); // i18n-ignore: SwissCirkus fork
        } else if (w.do === 'append') {
          await appendToDoc(w.id, w.text);
          say('assistant', `Added to “${name}”.`); // i18n-ignore: SwissCirkus fork
        } else {
          await replaceDocText(w.id, w.text);
          say('assistant', `Replaced the text of “${name}”.`); // i18n-ignore: SwissCirkus fork
        }
      } catch (err) {
        say('error', `Couldn't change “${name}”: ${err instanceof Error ? err.message : String(err)}`); // i18n-ignore: SwissCirkus fork
      }
    }
    setBusy(null);
    if (linked) { try { window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT)); } catch { /* ignore */ } }
  };

  const setUpDocs = async () => {
    setSettingUp(true);
    const ok = await setUpDocsAccess();
    setSettingUp(false);
    if (ok) say('assistant', 'Google Docs access is on. Ask me to find, read or write any of your Google Docs — nothing in a Doc changes until you press Apply.'); // i18n-ignore: SwissCirkus fork
  };

  const docTitle = (w: DocWrite) => (w.do === 'create' ? `Make a new Google Doc “${w.title}”`
    : w.do === 'append' ? `Add to “${w.name || w.id}”`
      : w.do === 'link' ? `Attach “${w.name || w.id}” to the project ${w.project}`
        : `Replace all the text of “${w.name || w.id}”`); // i18n-ignore: SwissCirkus fork

  const stop = () => { stoppedRef.current = true; if (abortRef.current) abortRef.current.abort(); else kontrollCancel(); };

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
        {!hello && (
          <button
            type="button"
            className={`sa-icon-btn${keyOpen ? ' on' : ''}`}
            title="AI key — use your own Claude, OpenAI or Gemini key" // i18n-ignore: web-only
            aria-label="AI key" // i18n-ignore: web-only
            aria-expanded={keyOpen || !aiReady}
            onClick={() => setKeyOpen((o) => !o)}
          >
            <FaKey />
          </button>
        )}
        {/* Google Docs access: off → shows the setup card; on → turns it off here. */}
        <button
          type="button"
          className={`sa-icon-btn${docsOn ? ' on' : ''}`}
          title={docsOn ? 'Google Docs access is on — click to turn it off' : 'Set up Google Docs access — let the assistant search, read and write your Google Docs'} // i18n-ignore: SwissCirkus fork
          aria-label="Google Docs access" // i18n-ignore: SwissCirkus fork
          aria-pressed={docsOn}
          disabled={!!busy}
          onClick={() => {
            if (!docsOn) { say('assistant', 'I can search, read and write your Google Docs once you allow it — a one-time setup.', true); return; } // i18n-ignore: SwissCirkus fork
            if (window.confirm('Turn off Google Docs access for the Script Assistant on this computer?')) turnOffDocsAccess(); // i18n-ignore: SwissCirkus fork
          }}
        >
          <FaGoogleDrive />
        </button>
        <button
          type="button"
          className="sa-icon-btn"
          title={t('scriptAssistant.clear')}
          aria-label={t('scriptAssistant.clear')}
          disabled={!!busy || (!messages.length && !proposal && !docProposal)}
          onClick={() => { setMessages([]); setProposal(null); setDocProposal(null); }}
        >
          <FaTrashAlt />
        </button>
      </div>

      {!hello && (keyOpen || !aiReady) && <ByokSettings onDone={aiReady ? () => setKeyOpen(false) : undefined} />}

      {/* Attached Google Docs are read by Kontroll with the writer's Google sign-in, so they are a Kontroll feature. */}
      {hello && <div className="sa-docs">
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
      </div>}
      {hello && attachOpen && (
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
              <button key={ex} type="button" className="sa-example" disabled={!aiReady} onClick={() => void send(ex)}>{ex}</button>
            ))}
            {aiReady && <p className="sa-hint">{t('scriptAssistant.hint', { name: engineLabel })}</p>}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`sa-message sa-${m.role}`}>
            {m.role !== 'error' && <div className="sa-role">{m.role === 'user' ? t('scriptAssistant.you') : t('scriptAssistant.assistant')}</div>}
            <div className="sa-text">{m.content}</div>
            {m.setup && !docsOn && (
              <div className="sa-setup">
                <p>{'Setting up Google Docs access lets the Script Assistant search all your Google Docs, read them, and — only when you press Apply — make or change them.' /* i18n-ignore: SwissCirkus fork */}</p>
                <ol>
                  <li>{'Press the button below; a Google window opens.' /* i18n-ignore */}</li>
                  <li>{'Pick your Google account and allow access to your Google Drive files (tick the box if Google shows one).' /* i18n-ignore */}</li>
                  <li>{"If Google says it hasn't verified the app, choose Advanced, then continue — it's your own app." /* i18n-ignore */}</li>
                </ol>
                <button type="button" className="sa-btn primary" onClick={() => void setUpDocs()} disabled={settingUp}>
                  <FaGoogleDrive /> {settingUp ? 'Waiting for Google…' : 'Set up Google Docs access' /* i18n-ignore */}
                </button>
                {docsMessage && <div className="sa-problems">{`Google said: ${docsMessage}` /* i18n-ignore */}</div>}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="sa-message sa-assistant">
            <div className="sa-text sa-thinking">{busy === 'docs' ? t('scriptAssistant.readingDocs') : busy === 'lookup' ? 'Working in your Google Docs…' /* i18n-ignore */ : t('scriptAssistant.thinking', { name: engineLabel })}</div>
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
        {docProposal && (
          <div className="sa-proposal">
            <div className="sa-proposal-title">{'Changes to your Google Docs — tick the ones you want' /* i18n-ignore */}</div>
            {docProposal.writes.map((w, i) => (
              <details key={i} className="sa-edit" open={docProposal.writes.length <= 2}>
                <summary>
                  <input
                    type="checkbox"
                    checked={docProposal.chosen[i]}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setDocProposal((prev) => prev && { ...prev, chosen: prev.chosen.map((c, j) => (j === i ? on : c)) });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={docTitle(w)}
                  />
                  <span>{docTitle(w)}</span>
                </summary>
                {w.do !== 'link' && <pre className="sa-edit-text">{docPreview(w.text)}</pre>}
              </details>
            ))}
            <div className="sa-proposal-actions">
              <button type="button" className="sa-btn primary" onClick={() => void applyDocs()} disabled={!docProposal.chosen.some(Boolean) || !!busy}>{t('scriptAssistant.apply')}</button>
              <button type="button" className="sa-btn" onClick={() => setDocProposal(null)}>{t('scriptAssistant.discard')}</button>
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
          disabled={!aiReady}
        />
        <div className="sa-input-actions">
          {/* Kontroll's live mic level, so you can see it's listening; then a note while your words are written out. */}
          {hello?.mic && micOn && !micStopping && (
            <span className="sa-mic-meter" role="img" aria-label="Listening">{/* i18n-ignore: Kontroll-only */}
              {(micLevels ?? Array(9).fill(0)).map((v, i) => <span key={i} style={{ height: `${Math.max(8, Math.round(v * 100))}%` }} />)}
            </span>
          )}
          {hello?.mic && micStopping && <span className="sa-mic-note">{'Transcribing…' /* i18n-ignore: Kontroll-only */}</span>}
          {hello?.mic && (
            <button
              type="button"
              className={`sa-mic${micOn ? ' live' : ''}`}
              onClick={() => kontrollMic(!micOn, input)}
              disabled={!!busy || micStopping}
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
            <button type="submit" className="sa-send" disabled={!input.trim() || !!busy || !aiReady} title={t('scriptAssistant.send')}><FaPaperPlane /> {t('scriptAssistant.send')}</button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ScriptAssistantPanel;
