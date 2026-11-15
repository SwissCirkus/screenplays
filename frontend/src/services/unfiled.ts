/**
 * Unfiled (SwissCirkus fork, Christian 2026-11-15: "anything I create … would just be at the top. And unless I drag it into
 * a folder, that's where it stays"). A project called "Unfiled" holds new scripts and new Google Docs; the Navigator shows
 * its contents at the very top, without a folder, and dragging one onto a project files it there.
 */
import { api, type ProjectInfo } from './api';

export const UNFILED_NAME = 'Unfiled';

export function isUnfiled(p: { name: string }): boolean {
  return p.name.trim().toLowerCase() === UNFILED_NAME.toLowerCase();
}

/** The Unfiled project, made the first time it's needed. */
export async function ensureUnfiled(): Promise<ProjectInfo> {
  const found = (await api.listProjects()).find(isUnfiled);
  return found ?? api.createProject(UNFILED_NAME);
}

/** "Untitled", or "Untitled 2", "Untitled 3"… when that's taken. */
export function nextUntitled(taken: string[], base = 'Untitled'): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
