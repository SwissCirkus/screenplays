/**
 * Navigator › Projects — the project library as folders, beside the script.
 *
 * Mirrors Manage Projects (same library, same data): every project is a
 * folder that opens to show its scripts, its Google Doc links and its other
 * files. Clicking a script opens it (saving the current one first); clicking
 * a Google Doc opens it in a new browser tab. Links are added with the
 * "Add Google Doc" form or by dragging a link — a browser tab, an address-bar
 * URL or a link on a page — onto a project.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ProjectInfo, type ScriptMeta } from '../services/api';
import { useProjectStore } from '../stores/projectStore';
import { leaveEditor } from '../services/pendingSave';
import { addProjectLink, openLinkInNewTab, readProjectLink, type ProjectAsset } from '../services/projectLinks';
import {
  dragMayCarryLink, isLinkAsset, linkDisplayName, linkFromDataTransfer, linkIcon, linkKind, normalizeLinkUrl,
} from '../utils/linkAssets';
import { showToast } from './Toast';
import { scriptRoute } from '../utils/projectRoutes';

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

  const refreshProject = useCallback(async (projectId: string) => {
    const c = await loadContents(projectId);
    setContents((prev) => ({ ...prev, [projectId]: c }));
  }, []);

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
      .then((list) => {
        if (!live) return;
        const sorted = [...list].sort((a, b) =>
          Number(b.pinned) - Number(a.pinned) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        setProjects(sorted);
      })
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

  const openScript = (projectId: string, script: ScriptMeta) => {
    if (currentProject?.id === projectId && currentScriptId === script.id) return;
    void leaveEditor(() => navigate(scriptRoute(projectId, script), { state: { from: `/project/${projectId}` } }));
  };

  const openProjectPage = (projectId: string) => {
    void leaveEditor(() => navigate(`/project/${projectId}`, { state: { from: '/projects' } }));
  };

  const manageProjects = () => { void leaveEditor(() => navigate('/projects')); };

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

  const removeLink = async (projectId: string, asset: ProjectAsset) => {
    if (!window.confirm(t('navigator.projects.removeLinkConfirm', { name: linkDisplayName(asset) }))) return;
    try {
      await api.deleteAsset(projectId, asset.id);
      await refreshProject(projectId);
    } catch {
      showToast(t('navigator.projects.linkFailed'), 'error');
    }
  };

  const dropProps = (projectId: string) => ({
    onDragOver: (e: React.DragEvent) => {
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
      const link = linkFromDataTransfer(e.dataTransfer);
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      void saveLink(projectId, link.url, link.name);
    },
  });

  return (
    <>
      <div className="navigator-header">
        <span className="navigator-title">{t('navigator.tabs.projects')}</span>
        {projects && <span className="scene-count">{projects.length}</span>}
        <button type="button" className="nav-projects-manage" onClick={manageProjects} title={t('navigator.projects.manageTip')}>
          {t('navigator.projects.manage')}
        </button>
      </div>
      <div className="navigator-list nav-projects">
        {projects === null && <div className="navigator-empty">{t('navigator.projects.loading')}</div>}
        {projects?.length === 0 && <div className="navigator-empty">{t('navigator.projects.empty')}</div>}
        {projects?.map((project) => {
          const folderOpen = isOpen(project.id);
          const c = contents[project.id];
          const isCurrent = currentProject?.id === project.id;
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
                aria-expanded={folderOpen}
                onClick={() => toggle(project.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(project.id); } }}
                title={t('navigator.projects.dropHint')}
              >
                <span className={`location-chevron${folderOpen ? ' expanded' : ''}`} aria-hidden="true">&#9662;</span>
                <span className="nav-project-folder" aria-hidden="true" style={project.color ? { color: project.color } : undefined}>
                  {folderOpen ? '📂' : '📁'}
                </span>
                <span className="nav-project-name">{project.name}</span>
              </div>
              {folderOpen && (
                <div className="nav-project-body">
                  {!c && <div className="nav-project-note">{t('navigator.projects.loading')}</div>}
                  {c && (
                    <>
                      {c.scripts.length > 0 && <div className="nav-project-section">{t('navigator.projects.scripts')}</div>}
                      {c.scripts.map((s) => {
                        const isOpenScript = isCurrent && currentScriptId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`nav-project-item${isOpenScript ? ' current' : ''}`}
                            onClick={() => openScript(project.id, s)}
                            title={isOpenScript ? t('navigator.projects.openNow') : t('navigator.projects.openScript')}
                          >
                            <span className="nav-project-icon" aria-hidden="true">{'🎬'}</span>
                            <span className="nav-project-label">{s.title || t('navigator.projects.untitled')}</span>
                          </button>
                        );
                      })}

                      <div className="nav-project-section">{t('navigator.projects.links')}</div>
                      {c.links.map(({ asset, url }) => (
                        <div key={asset.id} className="nav-project-item nav-project-link">
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
                          onClick={() => { setAdding(project.id); setLinkUrl(''); setLinkName(''); }}
                        >
                          <span className="nav-project-icon" aria-hidden="true">+</span>
                          <span className="nav-project-label">{t('navigator.projects.addLink')}</span>
                        </button>
                      )}

                      {c.files.length > 0 && <div className="nav-project-section">{t('navigator.projects.files')}</div>}
                      {c.files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="nav-project-item"
                          onClick={() => openProjectPage(project.id)}
                          title={t('navigator.projects.openProject')}
                        >
                          <span className="nav-project-icon" aria-hidden="true">{f.mime_type?.startsWith('image/') ? '🖼' : '📎'}</span>
                          <span className="nav-project-label">{f.original_name}</span>
                        </button>
                      ))}

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
    </>
  );
};

export default NavigatorProjects;
