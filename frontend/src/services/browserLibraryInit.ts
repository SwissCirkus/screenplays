/**
 * Starts the browser library on the web (SwissCirkus fork): IndexedDB as the
 * working copy, Google Drive as the mirror. Called from initStorage().
 */
import { createIndexedDbKv } from './kvStore';
import { createWebStorage } from './web-storage';
import { createDriveSync, createFetchTransport, currentDriveToken, setAppDriveSync, useDriveStatus, resumeDrive } from './driveSync';
import { setWebAssetFetcher, authedFetch } from './authedFetch';
import { createCollabClient } from './collabClient';
import { collabServerHttp } from '../config';

export const LIBRARY_CHANGED_EVENT = 'screenplays:library-changed';

export async function initBrowserLibrary(api: Record<string, unknown>): Promise<void> {
  const kv = await createIndexedDbKv();
  const sync = createDriveSync(kv, createFetchTransport(currentDriveToken), {
    toFountain: async (content) => {
      const { exportFountain } = await import('../utils/fountainExporter');
      return exportFountain(content as any);
    },
    onPulled: () => {
      try { window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT)); } catch { /* ignore */ }
    },
  });
  const storage = createWebStorage(kv, {
    onChange: (u) => sync.markDirty(u),
    // A script whose name came in from Drive but whose text hasn't yet: opening it fetches the text right then.
    loadMissingContent: (projectId, scriptId) => sync.loadScript(projectId, scriptId),
  });
  Object.assign(api, storage);
  // Co-writing: our own server when this build has one (VITE_COLLAB_SERVER), signed in with its account.
  const server = collabServerHttp();
  if (server) Object.assign(api, createCollabClient(server, authedFetch));
  setWebAssetFetcher((url) => storage.fetchWebAsset(url));
  setAppDriveSync(sync);
  useDriveStatus.getState().set({ pending: (await sync.pending()).length });
  void resumeDrive(); // stay connected: the kept token, or a quiet reconnect (2026-11-14)

  // Pick up work saved from elsewhere (Kontroll's Screenplay tab, another computer) without a reload: when the writer comes
  // back to this window, and every few minutes while it's open, look in Drive again — only while connected, at most once a
  // minute (Christian 2026-11-14: "in the browser … all my projects are not there").
  let lastLook = Date.now();
  const lookAgain = () => {
    if (!currentDriveToken() || Date.now() - lastLook < 60_000) return;
    const st = useDriveStatus.getState().state;
    if (st !== 'synced') return; // still connecting / saving / signed out — that path brings things in already
    lastLook = Date.now();
    void sync.connect();
  };
  window.addEventListener('focus', lookAgain);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lookAgain(); });
  setInterval(lookAgain, 5 * 60_000);

  // Don't close the tab on unsaved Drive writes.
  window.addEventListener('beforeunload', (e) => {
    const st = useDriveStatus.getState();
    if (st.pending > 0 && (st.state === 'saving' || st.state === 'synced')) {
      void sync.flush();
      e.preventDefault();
    }
  });
}
