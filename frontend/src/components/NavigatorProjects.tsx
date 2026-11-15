/**
 * Navigator › Projects — the project library as folders, beside the script.
 *
 * Mirrors Manage Projects (same library, same data): every project is a
 * folder that opens to show its scripts, its Google Doc links and its other
 * files. Clicking a script opens it (saving the current one first); clicking
 * a Google Doc opens it in a new browser tab. Links are added with the
 * "Add Google Doc" form or by dragging a link — a browser tab, an address-bar
 * URL or a link on a page — onto a project.
 *
 * Right-click does what Manage Projects does, in place: on a project — open
 * its page, new script, add a Google Doc, rename, pin, colour, new project,
 * delete; on a script — open, rename, duplicate, delete; on a link — open,
 * copy, remove; on empty space — new project, Manage Projects, refresh.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ProjectInfo, type ScriptMeta } from '../services/api';
import { useProjectStore } from '../stores/projectStore';
import { leaveEditor, CLOSE_DELETED_DOCUMENT_EVENT } from '../services/pendingSave';
import { addProjectLink, openLinkInNewTab, readProjectLink, type ProjectAsset } from '../services/projectLinks';
import {
  dragMayCarryLink, isLinkAsset, linkDisplayName, linkFromDataTransfer, linkIcon, linkKind, normalizeLinkUrl,
} from '../utils/linkAssets';
import { showToast } from './Toast';
import { authedFetch } from '../services/authedFetch';
import { EMPTY_SCREENPLAY, PROJECT_COLORS, scriptRoute } from '../utils/projectRoutes';
import NavContextMenu, { type NavMenuItem, type NavMenuState } from './NavContextMenu';

interface ProjectContents {
  scripts: ScriptMeta[];
  links: { asset: ProjectAsset; url: string | null }[];
  files: ProjectAsset[];
}

async function loadContents(projectId: string): Promise<ProjectContents> {
  const [scripts, assets] = await Promise.all([
    api.listScripts(projectId).catch(() => [] as ScriptMeta[]),
    api.listAssets(projectId).catch(() => [] as ProjectAsset[]),
  ]);
  const linkAssets = (assets as ProjectAsset[]).filter(isLinkAsset);
  // Read every link's URL up front, so a click can open it straight away —
  // a click that has to wait for a read first is blocked as a pop-up.
  const links = await Promise.all(linkAssets.map(async (asset) => ({ asset, url: await readProjectLink(projectId, asset) })));
  links.sort((a, b) => linkDisplayName(a.asset).localeCompare(linkDisplayName(b.asset)));
  const files = (assets as ProjectAsset[]).filter((a) => !isLinkAsset(a));
  const sorted = [...scripts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
  return { scripts: sorted, links, files };
}

function sortProjects(list: ProjectInfo[]): ProjectInfo[] {
  return [...list].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

interface Renaming { kind: 'project' | 'script'; projectId: string; id: string; value: string }

const NavigatorProjects: React.FC = () => {
  const { t } = useTranslation('story');
  const navigate = useNavigate();
  const currentProject = useProjectStore((s) => s.currentProject);
  const currentScriptId = useProjectStore((s) => s.currentScriptId);
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  // The open script's project starts open (and follows the script); any
  // project can be opened or closed by hand.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [contents, setContents] = useState<Record<string, ProjectContents | undefined>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Projects whose "Original files" list is unfolded (folded by default).
  const [originalsOpen, setOriginalsOpen] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<NavMenuState | null>(null);

  /** Save a copy of one of a project's files (an imported script's original, a picture) to the computer. */
  const saveAssetCopy = async (projectId: string, asset: ProjectAsset) => {
    try {
      const res = await authedFetch(api.getAssetUrl(projectId, asset.id, asset.filename));
      if (!res.ok) throw new Error(`the file could not be read (${res.status})`); // i18n-ignore: SwissCirkus
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { saveFile } = await import('../utils/fileOps');
      await saveFile(bytes, asset.original_name || asset.filename);
    } catch (err) {
      failed(err);
    }
  };
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [newProject, setNewProject] = useState<string | null>(null);

  const refreshProject = useCallback(async (projectId: string) => {
    const c = await loadContents(projectId);
    setContents((prev) => ({ ...prev, [projectId]: c }));
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(sortProjects(await api.listProjects()));
    } catch {
      setProjects((prev) => prev ?? []);
    }
  }, []);
  // Something else changed the library (Drive brought work in, the Script Assistant attached a Doc): show it.
  useEffect(() => {
    const onChanged = () => { requested.current.clear(); setContents({}); void reloadProjects(); };
    window.addEventListener('screenplays:library-changed', onChanged);
    return () => window.removeEventListener('screenplays:library-changed', onChanged);
  }, [reloadProjects]);

  const isOpen = useCallback(
    (projectId: string) => !closed.has(projectId) && (opened.has(projectId) || currentProject?.id === projectId),
    [opened, closed, currentProject],
  );
  const openFolder = (projectId: string) => {
    setOpened((prev) => new Set(prev).add(projectId));
    setClosed((prev) => { const next = new Set(prev); next.delete(projectId); return next; });
  };

  useEffect(() => {
    let live = true;
    api.listProjects()
      .then((list) => { if (live) setProjects(sortProjects(list)); })
      .catch(() => { if (live) setProjects([]); });
    return () => { live = false; };
  }, []);

  // Load each folder's contents the first time it is open.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const ids = [...opened, ...(currentProject ? [currentProject.id] : [])].filter((id) => !closed.has(id));
    for (const id of ids) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      void (async () => {
        const c = await loadContents(id);
        setContents((prev) => ({ ...prev, [id]: c }));
      })();
    }
  }, [opened, closed, currentProject]);

  const toggle = (projectId: string) => {
    if (!isOpen(projectId)) { openFolder(projectId); return; }
    setClosed((prev) => new Set(prev).add(projectId));
    setOpened((prev) => { const next = new Set(prev); next.delete(projectId); return next; });
  };

  const openScript = (projectId: string, script: Pick<ScriptMeta, 'id' | 'format'>) => {
    if (currentProject?.id === projectId && currentScriptId === script.id) return;
    void leaveEditor(() => navigate(scriptRoute(projectId, script), { state: { from: `/project/${projectId}` } }));
  };

  const openProjectPage = (projectId: string) => {
    void leaveEditor(() => navigate(`/project/${projectId}`, { state: { from: '/projects' } }));
  };

  const manageProjects = () => { void leaveEditor(() => navigate('/projects')); };

  const failed = (err: unknown) => {
    showToast(t('navigator.projects.actionFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
  };

  // ── Links ──

  const saveLink = async (projectId: string, rawUrl: string, name: string) => {
    const url = normalizeLinkUrl(rawUrl);
    if (!url) { showToast(t('navigator.projects.badLink'), 'error'); return false; }
    try {
      await addProjectLink(projectId, url, name, t(`navigator.projects.kind.${linkKind(url)}`));
      openFolder(projectId);
      await refreshProject(projectId);
      showToast(t('navigator.projects.linkAdded'), 'success');
      return true;
    } catch {
      showToast(t('navigator.projects.linkFailed'), 'error');
      return false;
    }
  };

  const submitAdd = async (projectId: string) => {
    if (await saveLink(projectId, linkUrl, linkName)) {
      setAdding(null); setLinkUrl(''); setLinkName('');
    }
  };

  const startAddLink = (projectId: string) => {
    openFolder(projectId);
    setAdding(projectId); setLinkUrl(''); setLinkName('');
  };

  const removeLink = async (projectId: string, asset: ProjectAsset) => {
    if (!window.confirm(t('navigator.projects.removeLinkConfirm', { name: linkDisplayName(asset) }))) return;
    try {
      await api.deleteAsset(projectId, asset.id);
      await refreshProject(projectId);
    } catch {
      showToast(t('navigator.projects.linkFailed'), 'error');
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('navigator.projects.linkCopied'), 'success');
    } catch (err) {
      failed(err);
    }
  };

  // ── Projects ──

  const createProject = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    try {
      const created = await api.createProject(name);
      setNewProject(null);
      await reloadProjects();
      openFolder(created.id);
      showToast(t('navigator.projects.projectCreated', { name }), 'success');
    } catch (err) {
      failed(err);
    }
  };

  const updateProject = async (project: ProjectInfo, patch: Partial<Pick<ProjectInfo, 'name' | 'pinned' | 'color'>>) => {
    setProjects((prev) => prev && sortProjects(prev.map((p) => (p.id === project.id ? { ...p, ...patch } : p))));
    try {
      await api.updateProject(project.id, patch);
      if (currentProject?.id === project.id) useProjectStore.getState().setCurrentProject({ ...currentProject, ...patch });
    } catch (err) {
      failed(err);
      await reloadProjects();
    }
  };

  const deleteProject = async (project: ProjectInfo) => {
    const count = contents[project.id]?.scripts.length;
    const question = count === undefined
      ? t('navigator.projects.deleteProjectConfirm', { name: project.name })
      : t('navigator.projects.deleteProjectConfirmCount', { name: project.name, scripts: count });
    if (!window.confirm(question)) return;
    try {
      // The open script belongs to it: close it first, so nothing is saved back into a deleted project — but stay in the
      // writer, on a blank page with the Navigator as it was (Christian 2026-11-14: "just delete it and keep me where I
      // already was", not the Manage Projects screen).
      if (currentProject?.id === project.id) await leaveEditor(() => window.dispatchEvent(new Event(CLOSE_DELETED_DOCUMENT_EVENT)));
      await api.deleteProject(project.id);
      showToast(t('navigator.projects.projectDeleted', { name: project.name }), 'success');
      await reloadProjects();
    } catch (err) {
      failed(err);
    }
  };

  // ── Scripts ──

  const newScript = async (projectId: string) => {
    try {
      const resp = await api.createScript(projectId, { title: t('navigator.projects.untitledScript'), format: 'screenplay', content: EMPTY_SCREENPLAY });
      await refreshProject(projectId);
      openFolder(projectId);
      openScript(projectId, resp.meta);
    } catch (err) {
      failed(err);
    }
  };

  const renameScript = async (projectId: string, scriptId: string, title: string) => {
    try {
      await api.saveScript(projectId, scriptId, { title });
      await refreshProject(projectId);
    } catch (err) {
      failed(err);
    }
  };

  const duplicateScript = async (projectId: string, script: ScriptMeta) => {
    try {
      await api.duplicateScript(projectId, script.id);
      await refreshProject(projectId);
      showToast(t('navigator.projects.scriptDuplicated', { name: script.title }), 'success');
    } catch (err) {
      failed(err);
    }
  };

  const deleteScript = async (projectId: string, script: ScriptMeta) => {
    if (!window.confirm(t('navigator.projects.deleteScriptConfirm', { name: script.title || t('navigator.projects.untitled') }))) return;
    try {
      if (currentProject?.id === projectId && currentScriptId === script.id) {
        // Close the deleted script but stay in the writer (not the project page) — see deleteProject.
        await leaveEditor(() => window.dispatchEvent(new Event(CLOSE_DELETED_DOCUMENT_EVENT)));
      }
      await api.deleteScript(projectId, script.id);
      showToast(t('navigator.projects.scriptDeleted', { name: script.title }), 'success');
      await refreshProject(projectId);
    } catch (err) {
      failed(err);
    }
  };

  // ── Rename (inline) ──

  const startRename = (r: Omit<Renaming, 'value'>, value: string) => setRenaming({ ...r, value });
  const commitRename = async () => {
    const r = renaming;
    setRenaming(null);
    if (!r) return;
    const value = r.value.trim();
    if (!value) return;
    if (r.kind === 'project') {
      const p = projects?.find((x) => x.id === r.id);
      if (p && p.name !== value) await updateProject(p, { name: value });
    } else {
      const s = contents[r.projectId]?.scripts.find((x) => x.id === r.id);
      if (s && s.title !== value) await renameScript(r.projectId, r.id, value);
    }
  };
  const renameInput = (r: Renaming) => (
    <input
      autoFocus
      className="nav-project-input nav-project-rename"
      value={r.value}
      aria-label={t('navigator.projects.rename')}
      onChange={(e) => setRenaming({ ...r, value: e.target.value })}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
        if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); }
      }}
      onBlur={() => { void commitRename(); }}
    />
  );

  // ── Menus ──

  const openMenu = (e: React.MouseEvent, items: NavMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const sep: NavMenuItem = { kind: 'separator' };
  const L = (key: string) => t(`navigator.projects.${key}` as 'navigator.projects.open');

  const backgroundItems = (): NavMenuItem[] => [
    { label: L('newProject'), onSelect: () => setNewProject('') },
    { label: L('manage'), onSelect: manageProjects },
    sep,
    { label: L('refresh'), onSelect: () => { requested.current.clear(); setContents({}); void reloadProjects(); } },
  ];

  const projectItems = (p: ProjectInfo): NavMenuItem[] => [
    { label: L('openProject'), onSelect: () => openProjectPage(p.id) },
    { label: L('newScript'), onSelect: () => { void newScript(p.id); } },
    { label: L('addLink'), onSelect: () => startAddLink(p.id) },
    sep,
    { label: L('rename'), onSelect: () => startRename({ kind: 'project', projectId: p.id, id: p.id }, p.name) },
    { label: p.pinned ? L('unpin') : L('pin'), onSelect: () => { void updateProject(p, { pinned: !p.pinned }); } },
    { kind: 'colors', label: L('color'), colors: PROJECT_COLORS, current: p.color || '', noColorLabel: L('noColor'), onPick: (color) => { void updateProject(p, { color }); } },
    sep,
    { label: L('newProject'), onSelect: () => setNewProject('') },
    { label: L('deleteProject'), danger: true, onSelect: () => { void deleteProject(p); } },
  ];

  const scriptItems = (projectId: string, s: ScriptMeta): NavMenuItem[] => [
    { label: L('open'), onSelect: () => openScript(projectId, s), disabled: currentProject?.id === projectId && currentScriptId === s.id },
    { label: L('rename'), onSelect: () => startRename({ kind: 'script', projectId, id: s.id }, s.title) },
    { label: L('duplicate'), onSelect: () => { void duplicateScript(projectId, s); } },
    sep,
    { label: L('deleteScript'), danger: true, onSelect: () => { void deleteScript(projectId, s); } },
  ];

  const linkItems = (projectId: string, asset: ProjectAsset, url: string | null): NavMenuItem[] => [
    { label: L('openLink'), disabled: !url, onSelect: () => { if (url) openLinkInNewTab(url); } },
    { label: L('copyLink'), disabled: !url, onSelect: () => { if (url) void copyLink(url); } },
    sep,
    { label: L('removeLink'), danger: true, onSelect: () => { void removeLink(projectId, asset); } },
  ];

  // ── Moving scripts between projects by dragging (SwissCirkus, Christian 2026-11-14: "drag those scripts from one folder
  //    into another and rearrange it"). A script dropped on another project moves there; a whole project dropped on
  //    another merges into it (asks first). A move is copy-then-delete: the script's text and settings go with it, its
  //    version history stays with the old project.
  const moveScriptTo = async (fromId: string, scriptId: string, toId: string): Promise<boolean> => {
    if (fromId === toId) return false;
    const full = await api.getScript(fromId, scriptId);
    const wasOpen = currentProject?.id === fromId && currentScriptId === scriptId;
    if (wasOpen) await leaveEditor(() => {}); // save what's on screen first
    const fresh = wasOpen ? await api.getScript(fromId, scriptId) : full;
    const made = await api.createScript(toId, {
      title: fresh.meta.title, format: fresh.meta.format, content: (fresh.content ?? undefined) as Record<string, unknown> | undefined,
    });
    await api.deleteScript(fromId, scriptId);
    if (wasOpen) {
      const target = (projects ?? []).find((p) => p.id === toId);
      if (target) openScript(toId, made.meta);
    }
    return true;
  };

  const moveScript = async (fromId: string, scriptId: string, toId: string) => {
    try {
      const title = contents[fromId]?.scripts.find((s) => s.id === scriptId)?.title || t('navigator.projects.untitled');
      if (!(await moveScriptTo(fromId, scriptId, toId))) return;
      const to = (projects ?? []).find((p) => p.id === toId)?.name || '';
      showToast(`Moved “${title}” to ${to}`, 'success'); // i18n-ignore: SwissCirkus
      await Promise.all([refreshProject(fromId), refreshProject(toId)]);
      openFolder(toId);
    } catch (err) {
      failed(err);
      await reloadProjects();
    }
  };

  const mergeProject = async (fromId: string, toId: string) => {
    const from = (projects ?? []).find((p) => p.id === fromId);
    const to = (projects ?? []).find((p) => p.id === toId);
    if (!from || !to || fromId === toId) return;
    try {
      const scripts = await api.listScripts(fromId);
      if (!window.confirm(`Move all ${scripts.length} script${scripts.length === 1 ? '' : 's'} of “${from.name}” into “${to.name}”, then delete the empty “${from.name}”?`)) return; // i18n-ignore: SwissCirkus
      for (const s of scripts) await moveScriptTo(fromId, s.id, toId);
      const left = await api.listScripts(fromId);
      if (left.length === 0) await api.deleteProject(fromId);
      showToast(`Merged “${from.name}” into “${to.name}”`, 'success'); // i18n-ignore: SwissCirkus
      await reloadProjects();
      openFolder(toId);
    } catch (err) {
      failed(err);
      await reloadProjects();
    }
  };

  const DRAG_SCRIPT = 'application/x-screenplays-script';
  const DRAG_PROJECT = 'application/x-screenplays-project';
  const dragScriptProps = (projectId: string, scriptId: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_SCRIPT, JSON.stringify({ projectId, scriptId }));
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    },
  });
  const dragProjectProps = (projectId: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_PROJECT, projectId);
      e.dataTransfer.effectAllowed = 'move';
    },
  });

  const dropProps = (projectId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes(DRAG_SCRIPT) || types.includes(DRAG_PROJECT)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTarget !== projectId) setDropTarget(projectId);
        return;
      }
      if (!dragMayCarryLink(e.dataTransfer.types)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
      if (dropTarget !== projectId) setDropTarget(projectId);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      setDropTarget(null);
      const script = e.dataTransfer.getData(DRAG_SCRIPT);
      if (script) {
        e.preventDefault(); e.stopPropagation();
        try { const { projectId: from, scriptId } = JSON.parse(script); void moveScript(from, scriptId, projectId); } catch { /* not ours */ }
        return;
      }
      const project = e.dataTransfer.getData(DRAG_PROJECT);
      if (project) {
        e.preventDefault(); e.stopPropagation();
        void mergeProject(project, projectId);
        return;
      }
      const link = linkFromDataTransfer(e.dataTransfer);
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      void saveLink(projectId, link.url, link.name);
    },
  });

  return (
    <>
      <div className="navigator-header" onContextMenu={(e) => openMenu(e, backgroundItems())}>
        <span className="navigator-title">{t('navigator.tabs.projects')}</span>
        {projects && <span className="scene-count">{projects.length}</span>}
        <button
          type="button"
          className="nav-projects-new"
          onClick={() => setNewProject('')}
          title={t('navigator.projects.newProject')}
          aria-label={t('navigator.projects.newProject')}
        >
          +
        </button>
        <button type="button" className="nav-projects-manage" onClick={manageProjects} title={t('navigator.projects.manageTip')}>
          {t('navigator.projects.manage')}
        </button>
        {/* SwissCirkus: the Projects page's drop box, for bringing in a pile of old scripts */}
        <button
          type="button"
          className="nav-projects-manage"
          onClick={manageProjects}
          title="Drop many old scripts (or whole folders) on the Projects page; file them as they are or let Smart organise group them into projects" // i18n-ignore
        >
          Bring in scripts…{/* i18n-ignore */}
        </button>
      </div>
      <div className="navigator-list nav-projects" onContextMenu={(e) => openMenu(e, backgroundItems())}>
        {newProject !== null && (
          <form className="nav-project-add-form nav-project-new-form" onSubmit={(e) => { e.preventDefault(); void createProject(newProject); }}>
            <input
              autoFocus
              className="nav-project-input"
              placeholder={t('navigator.projects.newProjectName')}
              aria-label={t('navigator.projects.newProjectName')}
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setNewProject(null); }}
            />
            <div className="nav-project-add-actions">
              <button type="submit" className="nav-project-btn primary" disabled={!newProject.trim()}>{t('navigator.projects.create')}</button>
              <button type="button" className="nav-project-btn" onClick={() => setNewProject(null)}>{t('navigator.projects.cancel')}</button>
            </div>
          </form>
        )}
        {projects === null && <div className="navigator-empty">{t('navigator.projects.loading')}</div>}
        {projects?.length === 0 && newProject === null && <div className="navigator-empty">{t('navigator.projects.empty')}</div>}
        {projects?.map((project) => {
          const folderOpen = isOpen(project.id);
          const c = contents[project.id];
          const isCurrent = currentProject?.id === project.id;
          const renamingThis = renaming?.kind === 'project' && renaming.id === project.id ? renaming : null;
          return (
            <div
              key={project.id}
              className={`nav-project${dropTarget === project.id ? ' drop-target' : ''}`}
              {...dropProps(project.id)}
            >
              <div
                className={`nav-project-row${isCurrent ? ' current' : ''}`}
                role="button"
                tabIndex={0}
                {...(renamingThis ? {} : dragProjectProps(project.id))}
                aria-expanded={folderOpen}
                onClick={() => { if (!renamingThis) toggle(project.id); }}
                onContextMenu={(e) => openMenu(e, projectItems(project))}
                onKeyDown={(e) => {
                  if (renamingThis) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(project.id); }
                  if (e.key === 'F2') { e.preventDefault(); startRename({ kind: 'project', projectId: project.id, id: project.id }, project.name); }
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ x: r.left + 24, y: r.bottom, items: projectItems(project) });
                  }
                }}
                title={t('navigator.projects.rowHint')}
              >
                <span className={`location-chevron${folderOpen ? ' expanded' : ''}`} aria-hidden="true">&#9662;</span>
                <span className="nav-project-folder" aria-hidden="true">{folderOpen ? '📂' : '📁'}</span>
                {project.color && <span className="nav-project-color" style={{ background: project.color }} aria-hidden="true" />}
                {renamingThis ? renameInput(renamingThis) : <span className="nav-project-name">{project.name}</span>}
                {project.pinned && !renamingThis && <span className="nav-project-pin" aria-label={t('navigator.projects.pinned')} title={t('navigator.projects.pinned')}>{'📌'}</span>}
              </div>
              {folderOpen && (
                <div className="nav-project-body">
                  {!c && <div className="nav-project-note">{t('navigator.projects.loading')}</div>}
                  {c && (
                    <>
                      {c.scripts.length > 0 && <div className="nav-project-section">{t('navigator.projects.scripts')}</div>}
                      {c.scripts.map((s) => {
                        const isOpenScript = isCurrent && currentScriptId === s.id;
                        const renamingScript = renaming?.kind === 'script' && renaming.id === s.id ? renaming : null;
                        if (renamingScript) {
                          return (
                            <div key={s.id} className="nav-project-item">
                              <span className="nav-project-icon" aria-hidden="true">{'🎬'}</span>
                              {renameInput(renamingScript)}
                            </div>
                          );
                        }
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`nav-project-item${isOpenScript ? ' current' : ''}`}
                            {...dragScriptProps(project.id, s.id)}
                            onClick={() => openScript(project.id, s)}
                            onContextMenu={(e) => openMenu(e, scriptItems(project.id, s))}
                            onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); startRename({ kind: 'script', projectId: project.id, id: s.id }, s.title); } }}
                            title={isOpenScript ? t('navigator.projects.openNow') : t('navigator.projects.openScript')}
                          >
                            <span className="nav-project-icon" aria-hidden="true">{'🎬'}</span>
                            <span className="nav-project-label">{s.title || t('navigator.projects.untitled')}</span>
                          </button>
                        );
                      })}

                      <div className="nav-project-section">{t('navigator.projects.links')}</div>
                      {c.links.map(({ asset, url }) => (
                        <div key={asset.id} className="nav-project-item nav-project-link" onContextMenu={(e) => openMenu(e, linkItems(project.id, asset, url))}>
                          <button
                            type="button"
                            className="nav-project-link-open"
                            disabled={!url}
                            onClick={() => { if (url) openLinkInNewTab(url); }}
                            title={url ? `${t('navigator.projects.openLink')}\n${url}` : t('navigator.projects.linkUnreadable')}
                          >
                            <span className="nav-project-icon" aria-hidden="true">{linkIcon(url ? linkKind(url) : 'web')}</span>
                            <span className="nav-project-label">{linkDisplayName(asset)}</span>
                          </button>
                          <button
                            type="button"
                            className="nav-project-remove"
                            onClick={() => removeLink(project.id, asset)}
                            title={t('navigator.projects.removeLink')}
                            aria-label={t('navigator.projects.removeLinkNamed', { name: linkDisplayName(asset) })}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      {adding === project.id ? (
                        <form
                          className="nav-project-add-form"
                          onSubmit={(e) => { e.preventDefault(); void submitAdd(project.id); }}
                        >
                          <input
                            autoFocus
                            className="nav-project-input"
                            type="url"
                            placeholder={t('navigator.projects.linkUrl')}
                            aria-label={t('navigator.projects.linkUrl')}
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(null); }}
                          />
                          <input
                            className="nav-project-input"
                            type="text"
                            placeholder={t('navigator.projects.linkName')}
                            aria-label={t('navigator.projects.linkName')}
                            value={linkName}
                            onChange={(e) => setLinkName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(null); }}
                          />
                          <div className="nav-project-add-actions">
                            <button type="submit" className="nav-project-btn primary" disabled={!linkUrl.trim()}>{t('navigator.projects.add')}</button>
                            <button type="button" className="nav-project-btn" onClick={() => setAdding(null)}>{t('navigator.projects.cancel')}</button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="nav-project-item nav-project-add"
                          onClick={() => startAddLink(project.id)}
                        >
                          <span className="nav-project-icon" aria-hidden="true">+</span>
                          <span className="nav-project-label">{t('navigator.projects.addLink')}</span>
                        </button>
                      )}

                      {/* SwissCirkus (Christian 2026-11-14): the imported scripts' original files under their own
                          "Original files" heading, folded away until clicked; clicking a file saves a copy of it (it used
                          to open the project page). Other files stay under Files. */}
                      {(() => {
                        const originals = c.files.filter((f) => Array.isArray(f.tags) && f.tags.includes('original'));
                        const others = c.files.filter((f) => !(Array.isArray(f.tags) && f.tags.includes('original')));
                        const fileRow = (f: (typeof c.files)[number]) => (
                          <button
                            key={f.id}
                            type="button"
                            className="nav-project-item"
                            onClick={() => { void saveAssetCopy(project.id, f); }}
                            onContextMenu={(e) => openMenu(e, [
                              { label: 'Save a copy…', onSelect: () => { void saveAssetCopy(project.id, f); } }, // i18n-ignore: SwissCirkus
                              { label: L('openProject'), onSelect: () => openProjectPage(project.id) },
                            ])}
                            title={`Save a copy of ${f.original_name}`} // i18n-ignore: SwissCirkus
                          >
                            <span className="nav-project-icon" aria-hidden="true">{f.mime_type?.startsWith('image/') ? '🖼' : '📎'}</span>
                            <span className="nav-project-label">{f.original_name}</span>
                          </button>
                        );
                        const shown = originalsOpen.has(project.id);
                        return (
                          <>
                            {originals.length > 0 && (
                              <button
                                type="button"
                                className="nav-project-section nav-project-section-toggle"
                                aria-expanded={shown}
                                onClick={() => setOriginalsOpen((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(project.id)) next.delete(project.id); else next.add(project.id);
                                  return next;
                                })}
                                title={shown ? 'Hide the original files' : 'Show the files these scripts were imported from'} // i18n-ignore: SwissCirkus
                              >
                                <span className={`location-chevron${shown ? ' expanded' : ''}`} aria-hidden="true">&#9662;</span>
                                {' '}Original files · {originals.length}{/* i18n-ignore: SwissCirkus */}
                              </button>
                            )}
                            {shown && originals.map(fileRow)}
                            {others.length > 0 && <div className="nav-project-section">{t('navigator.projects.files')}</div>}
                            {others.map(fileRow)}
                          </>
                        );
                      })()}

                      <button type="button" className="nav-project-page" onClick={() => openProjectPage(project.id)}>
                        {t('navigator.projects.openProject')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menu && <NavContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  );
};

export default NavigatorProjects;
