/**
 * Bring in many scripts at once — the drop box on the Projects page (SwissCirkus fork, Christian 2026-11-14).
 *
 * Drop scripts or whole folders (or choose them). Every file is read once, then a plan shows which project each one goes
 * into, three ways to make it — As they are (folders → projects), By title (drafts of one script together) and Smart
 * organise (Kontroll's assistant reads the scripts and groups them) — and every project name and file can still be
 * changed. Build makes the projects and their scripts; the library mirrors them to Google Drive by itself.
 * Logic in utils/bulkImport.ts.
 */
import React, { useMemo, useRef, useState } from 'react';
import { FaFileImport, FaFolderOpen, FaMagic, FaTimes } from 'react-icons/fa';
import { api, type ProjectInfo } from '../services/api';
import { inKontroll, kontrollAi, useKontrollBridge } from '../services/kontrollBridge';
import { importAccept } from '../utils/importScreenplay';
import {
  ORGANISE_SYSTEM, buildOrganisePrompt, buildProjects, collectDropped, importableOnly, matchExisting, mergeSameNames,
  parseOrganiseReply, planByFolder, planByTitle, readCandidates,
  type BuildResult, type Candidate, type DroppedFile, type PlannedProject,
} from '../utils/bulkImport';
import { showToast } from './Toast';
import './BulkImportBox.css';

/* i18n: English only — a SwissCirkus addition (the strings below are marked i18n-ignore). */

type Mode = 'folders' | 'title' | 'smart';
type Stage =
  | { kind: 'idle' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'plan' }
  | { kind: 'building'; done: number; total: number }
  | { kind: 'done'; result: BuildResult };

const LOOSE_NAME = 'Imported scripts'; // i18n-ignore: default project name

interface Props {
  projects: ProjectInfo[];
  onBuilt: () => void;
  onOpenProject: (id: string) => void;
}

const BulkImportBox: React.FC<Props> = ({ projects, onBuilt, onOpenProject }) => {
  const hello = useKontrollBridge((s) => s.hello);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlannedProject[]>([]);
  const [mode, setMode] = useState<Mode>('title');
  const [thinking, setThinking] = useState(false);
  const [smartNote, setSmartNote] = useState('');
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const readable = useMemo(() => cands.filter((c) => !c.error), [cands]);
  const unreadable = useMemo(() => cands.filter((c) => c.error), [cands]);
  const byId = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const placed = plan.reduce((n, p) => n + p.fileIds.length, 0);

  const usePlan = (p: PlannedProject[]) => setPlan(matchExisting(mergeSameNames(p), projects));

  const start = async (dropped: DroppedFile[]) => {
    const { files, ignored: skipped } = importableOnly(dropped);
    setIgnored(skipped);
    if (!files.length) {
      showToast(skipped.length ? `None of those are scripts I can read (${skipped.length} skipped).` : 'Nothing to import.', 'error'); // i18n-ignore
      return;
    }
    setStage({ kind: 'reading', done: 0, total: files.length });
    const read = await readCandidates(files, undefined, (done, total) => setStage({ kind: 'reading', done, total }));
    setCands(read);
    const anyFolders = read.some((c) => c.folder);
    const first: Mode = anyFolders ? 'folders' : 'title';
    setMode(first);
    setSmartNote('');
    usePlan(first === 'folders' ? planByFolder(read, LOOSE_NAME) : planByTitle(read));
    setStage({ kind: 'plan' });
  };

  const pick = (list: FileList | null, folders: boolean) => {
    const dropped: DroppedFile[] = Array.from(list || []).map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const folder = folders && rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      return { file, folder };
    });
    if (dropped.length) void start(dropped);
  };

  const chooseMode = async (m: Mode) => {
    setMode(m);
    setSmartNote('');
    if (m === 'folders') { usePlan(planByFolder(cands, LOOSE_NAME)); return; }
    if (m === 'title') { usePlan(planByTitle(cands)); return; }
    if (!inKontroll()) {
      setSmartNote('Smart organise uses Kontroll\'s assistant — open the writer in Kontroll\'s Screenplay tab. Grouped by title instead.'); // i18n-ignore
      usePlan(planByTitle(cands));
      return;
    }
    setThinking(true);
    const answer = await kontrollAi(ORGANISE_SYSTEM, buildOrganisePrompt(cands), hello?.engine ?? '', 8000);
    setThinking(false);
    const smart = answer.ok ? parseOrganiseReply(answer.text, cands) : null;
    if (smart) {
      usePlan(smart);
      setSmartNote(`Grouped by ${answer.engine || 'the assistant'} — check the projects below; you can still change anything.`); // i18n-ignore
    } else {
      usePlan(planByTitle(cands));
      setSmartNote(`The assistant couldn't sort them${answer.error ? ` (${answer.error})` : ''} — grouped by title instead.`); // i18n-ignore
    }
  };

  const renameProject = (i: number, name: string) => {
    setPlan((prev) => matchExisting(prev.map((p, j) => (j === i ? { ...p, name } : p)), projects));
  };

  const moveFile = (id: string, to: string) => {
    setPlan((prev) => {
      let next = prev.map((p) => ({ ...p, fileIds: p.fileIds.filter((x) => x !== id) }));
      if (to === '__new') {
        const c = byId.get(id);
        next.push({ name: c ? c.title : 'New project', fileIds: [id] }); // i18n-ignore
      } else if (to !== '__skip') {
        const i = Number(to);
        next = next.map((p, j) => (j === i ? { ...p, fileIds: [...p.fileIds, id] } : p));
      }
      return matchExisting(next.filter((p) => p.fileIds.length > 0), projects);
    });
  };

  const left = readable.filter((c) => !plan.some((p) => p.fileIds.includes(c.id)));

  const build = async () => {
    const total = placed;
    setStage({ kind: 'building', done: 0, total });
    const result = await buildProjects(plan.filter((p) => p.name.trim()), cands, api, (done, t) => setStage({ kind: 'building', done, total: t }));
    setStage({ kind: 'done', result });
    onBuilt();
  };

  const reset = () => { setStage({ kind: 'idle' }); setCands([]); setPlan([]); setIgnored([]); setSmartNote(''); };

  // ── Idle: the drop box ──
  if (stage.kind === 'idle' || stage.kind === 'reading') {
    return (
      <div
        className={`bulk-drop${over ? ' over' : ''}${stage.kind === 'reading' ? ' busy' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault(); setOver(false);
          if (stage.kind === 'reading') return;
          void start(await collectDropped(e.dataTransfer));
        }}
      >
        {stage.kind === 'reading' ? (
          <div className="bulk-drop-text">Reading {stage.done} of {stage.total} scripts…{/* i18n-ignore */}</div>
        ) : (
          <>
            <FaFileImport className="bulk-drop-icon" />
            <div className="bulk-drop-text">
              <strong>Bring in your scripts</strong> — drop script files or whole folders here{/* i18n-ignore */}
              <span className="bulk-drop-sub">Final Draft, Fountain, PDF, Word, Fade In, Celtx, WriterDuet, Highland… Then file them as they are, or let Smart organise group them into projects.{/* i18n-ignore */}</span>
            </div>
            <div className="bulk-drop-buttons">
              <button type="button" className="bulk-btn" onClick={() => filesInput.current?.click()}>Choose files…{/* i18n-ignore */}</button>
              <button type="button" className="bulk-btn" onClick={() => folderInput.current?.click()}><FaFolderOpen /> Choose a folder…{/* i18n-ignore */}</button>
            </div>
            <input ref={filesInput} type="file" multiple accept={importAccept()} hidden onChange={(e) => { pick(e.target.files, false); e.target.value = ''; }} />
            <input ref={folderInput} type="file" multiple hidden
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => { pick(e.target.files, true); e.target.value = ''; }} />
          </>
        )}
      </div>
    );
  }

  // ── Done ──
  if (stage.kind === 'done') {
    const r = stage.result;
    const scripts = r.projects.reduce((n, p) => n + p.scripts, 0);
    return (
      <div className="bulk-panel">
        <div className="bulk-head">
          <strong>Imported {scripts} script{scripts === 1 ? '' : 's'} into {r.projects.length} project{r.projects.length === 1 ? '' : 's'}</strong>{/* i18n-ignore */}
          <button type="button" className="bulk-icon" onClick={reset} aria-label="Close" title="Close"><FaTimes /></button>{/* i18n-ignore */}
        </div>
        <ul className="bulk-done-list">
          {r.projects.map((p) => (
            <li key={p.id}>
              <button type="button" className="bulk-link" onClick={() => onOpenProject(p.id)}>{p.name}</button>
              <span className="bulk-muted"> · {p.scripts} script{p.scripts === 1 ? '' : 's'}{p.created ? '' : ' added to the existing project'}</span>{/* i18n-ignore */}
            </li>
          ))}
        </ul>
        {r.failed.length > 0 && (
          <div className="bulk-warn">Couldn't import: {r.failed.map((f) => `${f.name} (${f.error})`).join(', ')}{/* i18n-ignore */}</div>
        )}
        <div className="bulk-muted">With Google Drive connected, each project is copied to its own folder in Screenplays.{/* i18n-ignore */}</div>
        <div className="bulk-actions"><button type="button" className="bulk-btn primary" onClick={reset}>Done{/* i18n-ignore */}</button></div>
      </div>
    );
  }

  // ── Plan / building ──
  const building = stage.kind === 'building';
  return (
    <div className="bulk-panel">
      <div className="bulk-head">
        <strong>{readable.length} script{readable.length === 1 ? '' : 's'} ready</strong>{/* i18n-ignore */}
        {unreadable.length > 0 && <span className="bulk-muted"> · {unreadable.length} couldn't be read</span>}{/* i18n-ignore */}
        {ignored.length > 0 && <span className="bulk-muted"> · {ignored.length} other file{ignored.length === 1 ? '' : 's'} skipped</span>}{/* i18n-ignore */}
        <button type="button" className="bulk-icon" onClick={reset} disabled={building} aria-label="Cancel" title="Cancel — nothing has been imported yet"><FaTimes /></button>{/* i18n-ignore */}
      </div>

      <div className="bulk-modes" role="radiogroup" aria-label="How to file them">{/* i18n-ignore */}
        <button type="button" role="radio" aria-checked={mode === 'folders'} className={`bulk-mode${mode === 'folders' ? ' on' : ''}`} disabled={building || thinking} onClick={() => void chooseMode('folders')}
          title="Each folder you dropped becomes a project; loose files go into one project">As they are{/* i18n-ignore */}</button>
        <button type="button" role="radio" aria-checked={mode === 'title'} className={`bulk-mode${mode === 'title' ? ' on' : ''}`} disabled={building || thinking} onClick={() => void chooseMode('title')}
          title="Drafts of the same script (same title once draft numbers, dates and copies are ignored) go into one project">By title{/* i18n-ignore */}</button>
        <button type="button" role="radio" aria-checked={mode === 'smart'} className={`bulk-mode${mode === 'smart' ? ' on' : ''}`} disabled={building || thinking} onClick={() => void chooseMode('smart')}
          title="Kontroll's assistant reads each script's title page, first scene and characters and groups them into projects">
          <FaMagic /> {thinking ? 'Organising…' : 'Smart organise'}{/* i18n-ignore */}
        </button>
      </div>
      {smartNote && <div className="bulk-note">{smartNote}</div>}

      <div className="bulk-projects">
        {plan.map((p, i) => (
          <div key={i} className="bulk-project">
            <div className="bulk-project-head">
              <input
                className="bulk-name"
                value={p.name}
                disabled={building}
                onChange={(e) => renameProject(i, e.target.value)}
                aria-label="Project name"
              />{/* i18n-ignore */}
              <span className="bulk-muted">{p.existingId ? 'adds to your existing project' : 'new project'} · {p.fileIds.length}</span>{/* i18n-ignore */}
            </div>
            <ul className="bulk-files">
              {p.fileIds.map((id) => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <li key={id}>
                    <span className="bulk-file" title={c.folder ? `${c.folder}/${c.name}` : c.name}>{c.title}</span>
                    <span className="bulk-muted bulk-file-meta">{c.name}{c.draft ? ` · ${c.draft}` : ''}{c.scenes ? ` · ${c.scenes} scenes` : ''}</span>{/* i18n-ignore */}
                    <select className="bulk-move" value={String(i)} disabled={building} onChange={(e) => moveFile(id, e.target.value)} aria-label={`Project for ${c.name}`}>{/* i18n-ignore */}
                      {plan.map((q, j) => <option key={j} value={String(j)}>{q.name || '(no name)'}</option>)}{/* i18n-ignore */}
                      <option value="__new">New project…</option>{/* i18n-ignore */}
                      <option value="__skip">Leave out</option>{/* i18n-ignore */}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {left.length > 0 && (
          <div className="bulk-project bulk-left">
            <div className="bulk-project-head"><span>Left out · {left.length}</span></div>{/* i18n-ignore */}
            <ul className="bulk-files">
              {left.map((c) => (
                <li key={c.id}>
                  <span className="bulk-file">{c.title}</span>
                  <span className="bulk-muted bulk-file-meta">{c.name}</span>
                  <select className="bulk-move" value="__skip" disabled={building} onChange={(e) => moveFile(c.id, e.target.value)} aria-label={`Project for ${c.name}`}>{/* i18n-ignore */}
                    <option value="__skip">Leave out</option>{/* i18n-ignore */}
                    {plan.map((q, j) => <option key={j} value={String(j)}>{q.name || '(no name)'}</option>)}
                    <option value="__new">New project…</option>{/* i18n-ignore */}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
        {unreadable.length > 0 && (
          <div className="bulk-warn">Couldn't read: {unreadable.map((c) => `${c.name} (${c.error})`).join(', ')}</div>
        )}
      </div>

      <div className="bulk-actions">
        <span className="bulk-muted">
          {building ? `Importing ${stage.done} of ${stage.total}…` : `${plan.length} project${plan.length === 1 ? '' : 's'}, ${placed} script${placed === 1 ? '' : 's'}`}{/* i18n-ignore */}
        </span>
        <button type="button" className="bulk-btn" onClick={reset} disabled={building}>Cancel{/* i18n-ignore */}</button>
        <button type="button" className="bulk-btn primary" onClick={() => void build()} disabled={building || thinking || placed === 0 || plan.some((p) => !p.name.trim())}>
          {building ? 'Importing…' : `Import into ${plan.length} project${plan.length === 1 ? '' : 's'}`}{/* i18n-ignore */}
        </button>
      </div>
    </div>
  );
};

export default BulkImportBox;
