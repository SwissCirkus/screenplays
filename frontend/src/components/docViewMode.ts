/** The Doc view's remembered mode and its live address (SwissCirkus fork, 2026-11-15). */
import { docIdOf } from '../services/googleDocsAccess';

export type DocViewMode = 'live' | 'copy';
const KEY = 'screenplays:docViewMode';

export function docViewMode(): DocViewMode {
  try { return localStorage.getItem(KEY) === 'copy' ? 'copy' : 'live'; } catch { return 'live'; }
}
export function saveDocViewMode(m: DocViewMode): void {
  try { localStorage.setItem(KEY, m); } catch { /* private window: this visit only */ }
}

/** Google's own Docs page for a Doc link (any of its address forms). */
export function liveDocUrl(url: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(docIdOf(url))}/edit`;
}
