/**
 * /api/drive — stay connected to Google Drive (services/driveTokens.ts). Every call needs the person's sign-in (requireAuth).
 *   GET    /status    → { available, connected }
 *   POST   /connect   { code } → { connected: true, access_token?, expires_in? } | 409 { needsConsent: true } | 400 { error }
 *   POST   /token     → { access_token, expires_in } | 409 { reconnect: true }
 *   DELETE /          → disconnect (Google forgets the pass too)
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDB } from '../db';
import * as D from '../services/driveTokens';

let google: D.GoogleDrivePass = D.realGoogle();
/** Tests: a fake Google. */
export function setDriveGoogle(g: D.GoogleDrivePass) { google = g; }
/** The Google in use (routes/auth.ts's one-step sign-in shares it). */
export const driveGoogle = () => google;

const router = Router();
router.use(requireAuth);
const uid = (req: any): string => req.user.id;
const off = (res: any) => res.status(503).json({ error: 'Staying connected to Google Drive isn\'t set up on this server' });

router.get('/status', async (req, res) => {
  res.json({ available: D.available(), connected: D.available() ? await D.isConnected(getDB(), uid(req)) : false });
});

router.post('/connect', async (req, res) => {
  if (!D.available()) return off(res);
  try {
    const r = await D.connect(getDB(), google, uid(req), req.body?.code);
    if (r.ok) return res.json({ connected: true, access_token: r.access_token, expires_in: r.expires_in, scope: r.scope });
    return res.status(r.needsConsent ? 409 : 400).json({ error: r.error, needsConsent: !!r.needsConsent });
  } catch (err: any) {
    console.warn('[drive] connect failed:', err?.message || err);
    res.status(400).json({ error: 'Google refused the connection — try again' });
  }
});

router.post('/token', async (req, res) => {
  if (!D.available()) return off(res);
  try { res.json(await D.freshPass(getDB(), google, uid(req))); }
  catch (err: any) {
    if (err instanceof D.DriveReconnect) return res.status(409).json({ reconnect: true, error: err.message });
    console.warn('[drive] fresh pass failed:', err?.message || err);
    res.status(502).json({ error: 'Google didn\'t answer — try again in a moment' });
  }
});

router.delete('/', async (req, res) => {
  await D.disconnect(getDB(), google, uid(req));
  res.json({ connected: false });
});

export default router;
