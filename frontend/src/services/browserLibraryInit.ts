/**
 * Starts the browser library on the web (SwissCirkus fork): IndexedDB as the
 * working copy, Google Drive as the mirror. Called from initStorage().
 */
import { createIndexedDbKv } from './kvStore';
import { createWebStorage } from './web-storage';
import { createDriveSync, createFetchTransport, currentDriveToken, setAppDriveSync, useDriveStatus } from './driveSync';
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
  const storage = createWebStorage(kv, { onChange: (u) => sync.markDirty(u) });
  Object.assign(api, storage);
  // Co-writing: our own server when this build has one (VITE_COLLAB_SERVER), signed in with its account.
  const server = collabServerHttp();
  if (server) Object.assign(api, createCollabClient(server, authedFetch));
  setWebAssetFetcher((url) => storage.fetchWebAsset(url));
  setAppDriveSync(sync);
  useDriveStatus.getState().set({ pending: (await sync.pending()).length });

  // Don't close the tab on unsaved Drive writes.
  window.addEventListener('beforeunload', (e) => {
    const st = useDriveStatus.getState();
    if (st.pending > 0 && (st.state === 'saving' || st.state === 'synced')) {
      void sync.flush();
      e.preventDefault();
    }
  });
}
