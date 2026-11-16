/**
 * AuthIndicator — compact badge shown in the MenuBar.
 *
 *   Signed in  → avatar + displayName (click → Settings → Account)
 *   Anonymous  → "Local only" chip (click → open login dialog)
 *
 * The point is to answer the user's question at a glance: "am I saving to the
 * server or just to this device?" — matching the user's requirement that the
 * app works offline without login but shows status clearly.
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { leaveEditor } from '../services/pendingSave';
import { FaCloud, FaUserCircle } from 'react-icons/fa';
import { useSettingsStore } from '../stores/settingsStore';
import { performLogout, useSigningOut } from '../services/collabAuth';
import { showToast } from './Toast';
import CollabLoginDialog from './CollabLoginDialog';
import { browserLibrary } from '../services/platform';
import { FaGoogleDrive } from 'react-icons/fa';
import { connectDrive, useDriveStatus, driveMenuLabel, checkOneStep } from '../services/driveSync';

/** "Christian Greet" → "CG"; "marshall@example.com" → "M". */
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const words = String(name || '').trim().split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  if (words.length >= 2) return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
  if (words.length === 1) return Array.from(words[0])[0].toUpperCase();
  return (Array.from(String(email || '?'))[0] || '?').toUpperCase();
}

/**
 * compact (web build with the co-writing server, Christian 2026-11-16: "just have share and signed in as … a round circle, just a
 * CG for me"): your initials in a circle, name and Google Drive in its menu. Signed out: a small Sign in that opens the one
 * Google window (signed in, and Drive connected for good — services/driveSync.ts signInWithGoogle).
 */
const AuthIndicator: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const drive = useDriveStatus();
  const { t } = useTranslation('collab');
  const collabAuth = useSettingsStore((s) => s.collabAuth);
  const authVerified = useSettingsStore((s) => s.authVerified);
  const signingOut = useSigningOut((s) => s.signingOut);
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);

  // Only show "signed in" once the server has confirmed the token. A stored
  // token that hasn't been verified (offline launch, server down) reads as
  // "Local only" — the user hasn't actually been authenticated this session.
  const signedIn = Boolean(collabAuth.accessToken && collabAuth.user && authVerified);

  // Recompute the dropdown's anchor position whenever it opens, and on
  // resize/scroll so it stays attached to the button. The dropdown is
  // portaled to <body> with position: fixed so the menu-bar's
  // overflow:hidden on mobile (added for horizontal scroll) doesn't clip it.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuRect({
        top: r.bottom + 4,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  // Close on outside click / tap. onMouseLeave doesn't fire on touch devices,
  // which is why this menu was unreachable on Android/iOS — now it closes on
  // any pointer interaction outside the menu or trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  if (!signedIn && compact) {
    const busy = drive.state === 'connecting';
    // the one Google window — or, on a server that can't keep Drive connected yet, the usual co-writing sign-in
    const signInNow = async () => { if (busy) return; if (await checkOneStep()) void connectDrive(); else setLoginOpen(true); };
    return (
      <>
      <button
        type="button"
        className="auth-indicator auth-indicator--local auth-indicator--compact-signin"
        onClick={() => { void signInNow(); }}
        title={drive.message || 'Sign in with Google: write together, share scripts, and keep them in your Google Drive'} // i18n-ignore: SwissCirkus
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {loginOpen && <CollabLoginDialog onClose={() => setLoginOpen(false)} onSuccess={() => setLoginOpen(false)} />}
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <button
          type="button"
          className="auth-indicator auth-indicator--local"
          onClick={() => setLoginOpen(true)}
          title={browserLibrary() ? 'Sign in with Google to write together with others in real time. Your scripts stay in this browser and your Google Drive.' : t('auth.localOnlyTitle')}
        >
          <FaCloud style={{ opacity: 0.6 }} />
          {/* SwissCirkus fork: beside the Drive button, "Local only" would read as "not saved" */}
          <span>{browserLibrary() ? 'Sign in to co-write' : t('auth.localOnly')}</span>
        </button>
        {loginOpen && (
          <CollabLoginDialog
            onClose={() => setLoginOpen(false)}
            onSuccess={() => setLoginOpen(false)}
          />
        )}
      </>
    );
  }

  const user = collabAuth.user!;

  if (signingOut) {
    return (
      <span className="auth-indicator auth-indicator--busy" role="status" aria-live="polite">
        <span className="auth-indicator__spinner" aria-hidden="true" />
        <span>{t('auth.signingOut')}</span>
      </span>
    );
  }

  const initial = compact ? initialsOf(user.displayName, user.email) : (user.displayName || user.email || '?').charAt(0).toUpperCase();
  const driveOk = drive.state === 'synced' || drive.state === 'saving' || drive.state === 'connecting';

  return (
    <div className="auth-indicator-wrap" style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        className={`auth-indicator auth-indicator--signed-in ${user.emailVerified ? '' : 'auth-indicator--unverified'}${compact ? ' auth-indicator--compact' : ''}`}
        onClick={() => setMenuOpen((v) => !v)}
        title={compact ? `${user.displayName || user.email} · ${driveMenuLabel(drive.state)}` : user.emailVerified ? t('auth.signedInAs', { name: user.displayName }) : t('auth.unverifiedTitle')}
        aria-label={compact ? `Signed in as ${user.displayName || user.email}` : undefined} // i18n-ignore: SwissCirkus
      >
        <span className="auth-indicator__avatar" aria-hidden="true">{initial}</span>
        {compact && !driveOk && <span className="auth-indicator__dot" aria-hidden="true" />}
        {!compact && <span className="auth-indicator__name">{user.displayName || user.email}</span>}
        {!compact && !user.emailVerified && <span className="auth-indicator__badge">{t('auth.verifyBadge')}</span>}
      </button>
      {menuOpen && menuRect && createPortal(
        <div
          ref={menuRef}
          className="auth-indicator__menu auth-indicator__menu--portal"
          role="menu"
          style={{ position: 'fixed', top: menuRect.top, right: menuRect.right }}
        >
          {compact && (
            <>
              <div className="auth-indicator__menu-who">
                <b>{user.displayName || user.email}</b>
                {user.displayName && <span>{user.email}</span>}
              </div>
              <button
                type="button"
                className="auth-indicator__menu-item"
                disabled={driveOk}
                onClick={() => { setMenuOpen(false); void connectDrive(); }}
                title={drive.message || (driveOk ? 'Your scripts are kept in your Google Drive, in the Screenplays folder' : 'Keep your scripts in your Google Drive — you only connect once')} // i18n-ignore: SwissCirkus
              >
                <FaGoogleDrive /> {driveMenuLabel(drive.state)}
              </button>
            </>
          )}
          <button
            type="button"
            className="auth-indicator__menu-item"
            onClick={() => {
              setMenuOpen(false);
              // Leaving the editor by router navigation fires neither
              // `beforeunload` nor Tauri's close handler, so the open document
              // is flushed — or, with auto-save off, asked about — first
              // (issues #65, #135).
              void leaveEditor(() => navigate('/settings'));
            }}
          >
            <FaUserCircle /> {t('auth.accountSettings')}
          </button>
          <button
            type="button"
            className="auth-indicator__menu-item"
            onClick={async () => {
              setMenuOpen(false);
              await performLogout();
              showToast(t('auth.signedOut'), 'success');
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default AuthIndicator;
