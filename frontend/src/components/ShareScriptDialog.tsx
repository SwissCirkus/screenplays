/**
 * Share — a script shared with people by email, like a Google Doc (SwissCirkus, Christian 2026-11-16: "just share it with somebody,
 * then they can edit it whenever they want … the rest happens in the background"). Replaces the host-a-session Collaborate window on
 * the web build (services/sharedScripts.ts; the server keeps the script).
 *
 * From one of your scripts: the first Share puts it on the co-writing server as a shared script (starting from what's on screen),
 * shares it, and opens it live — from then on you and the people you shared it with write in it whenever you like. In a shared
 * script: its owner sees who has it and can change what each may do or take it away; everyone can copy its link.
 * English only on purpose: this exists only on the SwissCirkus fork. // i18n-ignore
 */
import React, { useEffect, useRef, useState } from 'react';
import { ModalOverlay } from './ModalOverlay';
import { showToast } from './Toast';
import { useContacts, loadContacts, suggest, gmailInviteUrl, type Contact } from '../services/googleContacts';
import {
  createShared, getShared, shareWith, unshareWith, sharedLink, setSharedSeed, rememberShared, sharedIdFor,
  type SharePerson, type ShareRole, type SharedRole,
} from '../services/sharedScripts';

interface Props {
  /** The browser's own script that is open (null in a shared script). */
  localScriptId: string | null;
  /** The shared script that is open, or null. */
  sharedId: string | null;
  title: string;
  format: string;
  /** What a newly shared script starts from: the editor's content as it is now. */
  getSeed: () => Record<string, unknown> | null;
  /** Open a shared script live (after the first share). */
  onOpen: (sharedId: string) => void;
  onClose: () => void;
}

const ROLES: [ShareRole, string, string][] = [
  ['editor', 'Can edit', 'Writes in it with you'],
  ['suggester', 'Can suggest', 'Their changes are suggestions you accept or reject'],
  ['viewer', 'Can read', 'Reads along, changes nothing'],
];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const ShareScriptDialog: React.FC<Props> = ({ localScriptId, sharedId, title, format, getSeed, onOpen, onClose }) => {
  const [id, setId] = useState<string | null>(sharedId || sharedIdFor(localScriptId));
  const [role, setRole] = useState<SharedRole | null>(null);
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [owner, setOwner] = useState<{ name: string; email: string } | null>(null);
  const [text, setText] = useState('');
  const [pickedEmail, setPickedEmail] = useState('');
  const [newRole, setNewRole] = useState<ShareRole>('editor');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  const [hi, setHi] = useState(-1);
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contactsOn = useContacts((s) => s.on);
  const contacts = useContacts((s) => s.contacts);
  const contactsLoading = useContacts((s) => s.loading);
  const hits = listOpen ? suggest(contacts, text) : [];

  // an existing shared script: who has it, and what you may do
  const refresh = async (sid: string) => {
    try { const m = await getShared(sid); setRole(m.role); setPeople(m.shares || []); setOwner(m.owner || null); }
    catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
  };
  useEffect(() => { inputRef.current?.focus(); if (id) void refresh(id); void loadContacts(false); }, []); // suggestions load by themselves once allowed (the server keeps them, 2026-11-17) // eslint-disable-line react-hooks/exhaustive-deps

  const canManage = !id || role === 'owner';
  const email = pickedEmail || (isEmail(text) ? text.trim() : '');

  const share = async () => {
    if (!email) { setProblem('Type an email address, or pick someone from the suggestions'); return; }
    setBusy(true); setProblem('');
    try {
      let sid = id;
      if (!sid) {
        // the first share: the script goes onto the co-writing server, starting from what's on screen
        const made = await createShared(title || 'Untitled', format || 'screenplay');
        sid = made.id;
        const seed = getSeed();
        if (seed) setSharedSeed(sid, seed);
        if (localScriptId) rememberShared(localScriptId, sid);
        setId(sid); setRole('owner');
      }
      await shareWith(sid, email, newRole);
      showToast(`Shared with ${email}`, 'success');
      setText(''); setPickedEmail('');
      if (!sharedId) { onOpen(sid); onClose(); return; } // from your own script: now you write in the shared one
      await refresh(sid);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const changeRole = async (p: SharePerson, r: ShareRole) => {
    if (!id) return;
    try { await shareWith(id, p.email, r); await refresh(id); } catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
  };
  const remove = async (p: SharePerson) => {
    if (!id) return;
    try { await unshareWith(id, p.email); await refresh(id); showToast(`${p.email} no longer has it`, 'info'); } catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
  };
  const copyLink = async () => {
    if (!id) return;
    try { await navigator.clipboard.writeText(sharedLink(id)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setProblem("Couldn't copy the link"); }
  };
  const emailThem = (p: SharePerson) => { if (id) window.open(gmailInviteUrl(p.email, title, sharedLink(id)), '_blank', 'noopener'); };
  const pick = (c: Contact) => { setText(c.name || c.email); setPickedEmail(c.email); setListOpen(false); setHi(-1); inputRef.current?.focus(); };

  return (
    <ModalOverlay className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-box share-script" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="dialog-header">Share “{title || 'Untitled'}”</div>
        <div className="dialog-body">
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--fd-text-muted)' }}>
            {id
              ? 'Everyone here can open it whenever they like — no need to be online together. Changes show up live for whoever has it open, and are kept for the next time.'
              : 'Share this script with people by email. They open it whenever they like and write in it — no need to be online together. You see their changes live, or the next time you open it.'}
            {owner && role !== 'owner' && <><br />Shared by {owner.name || owner.email}.</>}
          </p>

          {canManage && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="collab-name-wrap">
                  <input
                    ref={inputRef} className="dialog-input" style={{ width: '100%' }}
                    placeholder={contactsOn ? 'Email — suggestions from Gmail' : 'Their email address'}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setPickedEmail(''); setListOpen(true); setHi(-1); }}
                    onFocus={() => setListOpen(true)} onBlur={() => setTimeout(() => setListOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (hits.length && e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
                      else if (hits.length && e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
                      else if (e.key === 'Enter') { e.preventDefault(); if (hits.length && hi >= 0) pick(hits[hi]); else void share(); }
                    }}
                    disabled={busy} aria-label="Email address" aria-autocomplete="list"
                  />
                  {hits.length > 0 && (
                    <div className="collab-suggest" role="listbox">
                      {hits.map((c, i) => (
                        <button type="button" key={c.email} role="option" aria-selected={i === hi} className={`collab-suggest-item${i === hi ? ' on' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
                          <span className="collab-suggest-name">{c.name || c.email}</span>{c.name && <span className="collab-suggest-email">{c.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select className="dialog-input" style={{ width: 'auto' }} value={newRole} onChange={(e) => setNewRole(e.target.value as ShareRole)} aria-label="What they may do">
                  {ROLES.map(([v, label, tip]) => <option key={v} value={v} title={tip}>{label}</option>)}
                </select>
                <button className="dialog-btn dialog-btn-primary" onClick={() => void share()} disabled={busy || !text.trim()}>{busy ? 'Sharing…' : 'Share'}</button>
              </div>
              <div className="collab-gmail-line">
                {pickedEmail && <span>Shares with <b>{pickedEmail}</b></span>}
                {/* on, but nothing loaded (Google's permission runs out after an hour; the list is kept in memory only): a click asks again — it used to
                    hide the button once on, leaving no way to get the suggestions back (Christian 2026-11-17) */}
                {(!contactsOn || (!contacts.length && !contactsLoading)) && <button type="button" className="collab-gmail-link" onClick={() => void loadContacts(true)} disabled={contactsLoading}>{contactsLoading ? 'Asking Google…' : contactsOn ? 'Load suggestions from Gmail' : 'Suggest people from Gmail'}</button>}
              </div>
            </>
          )}

          {id && role === 'owner' && (
            <div className="collab-sessions-list">
              <label className="dialog-label" style={{ fontSize: 14, marginTop: 12 }}>{people.length ? 'Shared with' : 'Not shared with anyone yet'}</label>
              {people.map((p) => (
                <div key={p.email} className="collab-session-item">
                  <div className="collab-session-info"><span className="collab-session-name">{p.email}</span></div>
                  <div className="collab-session-actions">
                    <select className="dialog-input" style={{ width: 'auto', padding: '4px 6px' }} value={p.role} onChange={(e) => void changeRole(p, e.target.value as ShareRole)} aria-label={`What ${p.email} may do`}>
                      {ROLES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    <button className="collab-copy-btn" onClick={() => emailThem(p)} title={`Open a Gmail message to ${p.email} with the link — you press Send`}>Email</button>
                    <button className="collab-revoke-btn" onClick={() => void remove(p)} title={`${p.email} loses access`}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {problem && <div className="collab-gmail-problem" role="alert" style={{ marginTop: 10 }}>{problem}</div>}
        </div>
        <div className="dialog-footer">
          {id && <button className="dialog-btn" onClick={() => void copyLink()} title="The link opens it for anyone it's shared with">{copied ? 'Link copied' : 'Copy link'}</button>}
          <div style={{ flex: 1 }} />
          <button className="dialog-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalOverlay>
  );
};

export default ShareScriptDialog;
