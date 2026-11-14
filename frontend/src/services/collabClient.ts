/**
 * Co-writing invites for the browser library (SwissCirkus fork) — the same calls
 * local-storage.ts makes on desktop, straight to our co-writing server
 * (config.collabServerHttp). Used only when that server is configured; without
 * it web-storage's stubs explain that co-writing isn't set up.
 */
import type { CollabSession } from './api';

export function createCollabClient(serverHttp: string, fetcher: (url: string, init?: RequestInit) => Promise<Response>) {
  const base = serverHttp.replace(/\/+$/, '');
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetcher(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 401) throw new Error('Sign in to co-write (the account button at the top right).');
      throw new Error(`Co-writing server error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return res.json() as Promise<T>;
  }
  return {
    createCollabInvite(projectId: string, scriptId: string, collaboratorName: string, role = 'editor', expiresInHours = 1, sessionNonce = ''): Promise<CollabSession> {
      return call('/api/collab/invite', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId, script_id: scriptId, collaborator_name: collaboratorName,
          role, expires_in_hours: expiresInHours, session_nonce: sessionNonce,
        }),
      });
    },
    validateCollabSession(token: string): Promise<CollabSession> {
      return call(`/api/collab/session/${encodeURIComponent(token)}`);
    },
    listCollabSessions(projectId: string, scriptId: string): Promise<CollabSession[]> {
      return call(`/api/collab/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(scriptId)}`);
    },
    revokeCollabSession(token: string): Promise<{ message: string }> {
      return call(`/api/collab/session/${encodeURIComponent(token)}`, { method: 'DELETE' });
    },
    revokeAllCollabSessions(projectId: string, scriptId: string): Promise<{ message: string }> {
      return call(`/api/collab/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(scriptId)}`, { method: 'DELETE' });
    },
  };
}
