/**
 * Google Doc (and other web) links kept in a project — see utils/linkAssets.ts
 * for how a link is stored. These go through `api`, so they work on whichever
 * library is active (browser library mirrored to Drive, SQLite, HTTP server).
 */
import { api } from './api';
import { authedFetch } from './authedFetch';
import { isLinkAsset, makeLinkFile, parseLinkFile, type LinkAssetLike } from '../utils/linkAssets';
import { inKontroll, kontrollOpen } from './kontrollBridge';

export interface ProjectAsset extends LinkAssetLike {
  id: string; filename: string; original_name: string; mime_type: string;
  size_bytes: number; tags: string[]; created_at: string;
}

/** Add a link to a project. `fallbackName` is used when the writer gave no name. */
export async function addProjectLink(projectId: string, url: string, name: string, fallbackName: string): Promise<ProjectAsset> {
  return api.uploadAsset(projectId, makeLinkFile(url, name, fallbackName), []);
}

/** The URL a link asset points at, or null when it can't be read. */
export async function readProjectLink(projectId: string, asset: ProjectAsset): Promise<string | null> {
  if (!isLinkAsset(asset)) return null;
  try {
    const res = await authedFetch(api.getAssetUrl(projectId, asset.id, asset.filename));
    if (!res.ok) return null;
    return parseLinkFile(await res.text());
  } catch {
    return null;
  }
}

/**
 * Open a link in a new browser tab. Called straight from the click (no await
 * before it) so the browser treats it as the user's own action and doesn't
 * block it as a pop-up. Inside Kontroll it opens in a Kontroll web tab, signed
 * in to Google like the other web tabs; if Kontroll refuses it, a window opens.
 */
export function openLinkInNewTab(url: string): void {
  if (inKontroll()) {
    void kontrollOpen(url).then((ok) => { if (!ok) window.open(url, '_blank', 'noopener,noreferrer'); });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
