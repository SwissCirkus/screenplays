/**
 * /api/shared — shared scripts (services/sharedScripts.ts). Every call needs the person's sign-in (requireAuth).
 *   GET    /                      → { owned: [...with shares], sharedWithMe: [...] }
 *   POST   /                      { title, format } → the new script (you own it; its live text starts empty — your writer fills it)
 *   GET    /:id                   → the script and your role (404 without access)
 *   PATCH  /:id                   { title } — owner or editor
 *   DELETE /:id                   owner only — removes it for everyone
 *   POST   /:id/shares            { email, role } — owner only; role editor / suggester / viewer
 *   DELETE /:id/shares/:email     owner only — that person loses access (their live connection is closed)
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDB } from '../db';
import * as S from '../services/sharedScripts';

let closeDocument: (documentName: string) => void = () => {};
/** server.ts hands over how to close a document's live connections (after unsharing or deleting). */
export function setCloseDocument(fn: (documentName: string) => void) { closeDocument = fn; }

const router = Router();
router.use(requireAuth);

const who = (req: any): S.Who => ({ id: req.user.id, email: req.user.email });

router.get('/', async (req, res) => {
  res.json(await S.listFor(getDB(), who(req)));
});

router.post('/', async (req, res) => {
  const row = await S.createScript(getDB(), who(req), req.body?.title, req.body?.format);
  res.status(201).json({ id: row.id, title: row.title, format: row.format, documentName: S.docNameOf(row.id), role: 'owner' });
});

router.get('/:id', async (req, res) => {
  const role = await S.accessOf(getDB(), req.params.id, who(req));
  if (!role) { res.status(404).json({ error: 'Not found' }); return; }
  const list = await S.listFor(getDB(), who(req));
  const item = [...list.owned, ...list.sharedWithMe].find((x) => x.id === req.params.id);
  res.json({ ...item, role });
});

router.patch('/:id', async (req, res) => {
  const role = await S.accessOf(getDB(), req.params.id, who(req));
  if (role !== 'owner' && role !== 'editor') { res.status(role ? 403 : 404).json({ error: role ? 'Only the owner or an editor can rename it' : 'Not found' }); return; }
  res.json({ title: await S.rename(getDB(), req.params.id, req.body?.title) });
});

router.delete('/:id', async (req, res) => {
  const role = await S.accessOf(getDB(), req.params.id, who(req));
  if (role !== 'owner') { res.status(role ? 403 : 404).json({ error: role ? 'Only the owner can delete it' : 'Not found' }); return; }
  closeDocument(S.docNameOf(req.params.id));
  await S.remove(getDB(), req.params.id);
  res.json({ ok: true });
});

router.post('/:id/shares', async (req, res) => {
  const role = await S.accessOf(getDB(), req.params.id, who(req));
  if (role !== 'owner') { res.status(role ? 403 : 404).json({ error: role ? 'Only the owner can share it' : 'Not found' }); return; }
  const email = S.normEmail(req.body?.email), r = String(req.body?.role || 'editor');
  if (!S.validEmail(email)) { res.status(400).json({ error: 'That isn\'t an email address' }); return; }
  if (!(S.SHARE_ROLES as readonly string[]).includes(r)) { res.status(400).json({ error: 'Role must be editor, suggester or viewer' }); return; }
  if (email === S.normEmail(req.user!.email)) { res.status(400).json({ error: 'That\'s you — you own it already' }); return; }
  await S.share(getDB(), req.params.id, email, r);
  // a changed role takes effect at once: their live connection reconnects with it
  closeDocument(S.docNameOf(req.params.id));
  res.status(201).json({ email, role: r });
});

router.delete('/:id/shares/:email', async (req, res) => {
  const role = await S.accessOf(getDB(), req.params.id, who(req));
  if (role !== 'owner') { res.status(role ? 403 : 404).json({ error: role ? 'Only the owner can change who it is shared with' : 'Not found' }); return; }
  const removed = await S.unshare(getDB(), req.params.id, S.normEmail(req.params.email));
  if (removed) closeDocument(S.docNameOf(req.params.id)); // they reconnect without access and are refused; the others reconnect
  res.json({ ok: true, removed });
});

export default router;
