/**
 * Commands from Kontroll — SwissCirkus fork (2026-11-20).
 *
 * The bridge (kontrollBridge.ts) was one-way: the page asks Kontroll for things. Story Builder in Kontroll now drives the writer too:
 * it lists the writer's projects and their scripts, makes a project with an outline (a Treatment) and a script, opens a script, and
 * reads a script back as Fountain when the writer leaves the tab. Kontroll calls `window.__kScreen.command(id, name, args)`; the answer
 * goes back through the same mailbox as a `result` request carrying that id.
 *
 * Everything goes through `api` — the writer's own library (in this browser, mirrored to Google Drive) — exactly as the writer's own
 * menus do; nothing here reaches anything else.
 */
import { api, type ScriptMeta } from './api';
import { fountainToNodes } from '../addons/script-assistant/scriptEdits';
import { exportFountain } from '../utils/fountainExporter';
import { EMPTY_SCREENPLAY } from '../utils/projectRoutes';

type Args = Record<string, unknown>;
type Answer = Record<string, unknown>;
type Navigate = (to: string) => void;

let navigateTo: Navigate | null = null;
/** App.tsx hands over the router's navigate, so Kontroll can open a script. */
export function setKontrollNavigate(fn: Navigate | null): void { navigateTo = fn; }

/** The script open in the editor right now (MenuBar registers it), with what's on screen — saved or not. */
export interface OpenScript { projectId: string; scriptId: string; title: string; fountain: string }
let currentProvider: (() => OpenScript | null) | null = null;
export function setKontrollCurrentScript(fn: (() => OpenScript | null) | null): void { currentProvider = fn; }

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v : '').slice(0, max);
const isScreenplay = (m: ScriptMeta): boolean => !m.format || m.format === 'screenplay';

function treatmentDoc(text: string): Record<string, unknown> {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean);
  return { type: 'doc', content: paras.length ? paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) : [{ type: 'paragraph' }] };
}
function scriptDoc(fountain: string): Record<string, unknown> {
  const nodes = fountain.trim() ? fountainToNodes(fountain) : [];
  return nodes.length ? { type: 'doc', content: nodes } : (EMPTY_SCREENPLAY as Record<string, unknown>);
}

async function findOrCreateProject(name: string): Promise<{ id: string; name: string }> {
  const want = name.trim() || 'Untitled'; // i18n-ignore: a stored name
  const list = await api.listProjects();
  const hit = list.find((p) => p.name.trim().toLowerCase() === want.toLowerCase());
  if (hit) return { id: hit.id, name: hit.name };
  const made = await api.createProject(want);
  return { id: made.id, name: made.name };
}

export async function runKontrollCommand(name: string, args: Args): Promise<Answer> {
  switch (name) {
    case 'ready':
      return { ok: true };

    case 'listProjects': {
      const projects = await api.listProjects();
      const out = [];
      for (const p of projects) {
        let scripts: ScriptMeta[] = [];
        try { scripts = await api.listScripts(p.id); } catch { /* a project that can't be read is listed empty */ }
        out.push({ id: p.id, name: p.name, scripts: scripts.filter(isScreenplay).map((s) => ({ id: s.id, title: s.title, updated: s.updated_at })) });
      }
      return { ok: true, projects: out };
    }

    // a project (found by name, or made) with the outline as a Treatment and the script — either can be empty
    case 'createProject': {
      const project = await findOrCreateProject(str(args.name, 200));
      const title = str(args.title, 200).trim() || project.name;
      const outline = str(args.outline, 400_000), fountain = str(args.fountain, 4_000_000);
      let outlineId: string | null = null;
      if (outline.trim()) {
        const t = await api.createScript(project.id, { title: title + ' — outline', format: 'treatment', content: treatmentDoc(outline) }); // i18n-ignore: a stored title
        outlineId = t.meta.id;
      }
      const s = await api.createScript(project.id, { title, format: 'screenplay', content: scriptDoc(fountain) });
      return { ok: true, projectId: project.id, projectName: project.name, scriptId: s.meta.id, outlineId };
    }

    case 'getScript': {
      const projectId = str(args.projectId, 200), scriptId = str(args.scriptId, 200);
      const open = currentProvider ? currentProvider() : null;
      if (open && open.projectId === projectId && open.scriptId === scriptId) return { ok: true, title: open.title, fountain: open.fountain };
      const r = await api.getScript(projectId, scriptId);
      const fountain = r.content ? exportFountain(r.content as never) : '';
      return { ok: true, title: r.meta.title, fountain };
    }

    case 'saveScript': {
      const projectId = str(args.projectId, 200), scriptId = str(args.scriptId, 200);
      await api.saveScript(projectId, scriptId, { content: scriptDoc(str(args.fountain, 4_000_000)) });
      return { ok: true };
    }

    case 'openScript': {
      const projectId = str(args.projectId, 200), scriptId = str(args.scriptId, 200);
      if (!navigateTo) return { ok: false, error: 'The writer is still starting' }; // i18n-ignore: Kontroll-only
      navigateTo(`/project/${encodeURIComponent(projectId)}/edit/${encodeURIComponent(scriptId)}`);
      return { ok: true };
    }

    case 'current': {
      const open = currentProvider ? currentProvider() : null;
      return open ? { ok: true, ...open } : { ok: true, projectId: null };
    }

    default:
      return { ok: false, error: 'Unknown command: ' + name }; // i18n-ignore: Kontroll-only
  }
}
