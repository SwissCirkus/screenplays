/**
 * Web build only (SwissCirkus fork, Christian 2026-11-15): make the online writer start like an app.
 *  - Every start: a short splash with the name.
 *  - First visit: a sign-in card — Sign in with Google (your scripts are kept in your own Google Drive) or Not now (kept
 *    in this browser only). Either way it then opens straight onto a new, empty script, already saved as "Untitled" in
 *    Unfiled, with the Navigator's Projects tab open beside it (Christian 2026-11-16: "takes them straight to an empty page
 *    of a screenplay that is saved as in their projects as untitled … and projects on the side").
 *  - Inside Kontroll's Screenplay tab none of this shows (Kontroll says hello within moments of the page loading; the
 *    splash only fades in after that).
 * English only on purpose: this exists only on the SwissCirkus web build. // i18n-ignore
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaGoogle } from 'react-icons/fa';
import { useKontrollBridge } from '../services/kontrollBridge';
import { connectDrive, useDriveStatus, wasConnectedBefore } from '../services/driveSync';
import { APP_NAME, nextStep, NAV_TAB_ONCE } from './webWelcomeSteps';
import { api } from '../services/api';
import { ensureUnfiled, nextUntitled } from '../services/unfiled';
import { scriptRoute } from '../utils/projectRoutes';
import { useEditorStore } from '../stores/editorStore';
import './WebWelcome.css';

const WELCOMED = 'screenplays:welcomed';
const SPLASH_MS = 1300;

function welcomedBefore(): boolean {
  try { return localStorage.getItem(WELCOMED) === '1' || wasConnectedBefore(); } catch { return true; }
}

const WebWelcome: React.FC = () => {
  const hello = useKontrollBridge((s) => s.hello);
  const navigate = useNavigate();
  const [stage, setStage] = useState<'splash' | 'leaving' | 'signin' | 'gone'>('splash');
  const [firstVisit] = useState(() => !welcomedBefore());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (hello || stage !== 'splash') return;
    const t = window.setTimeout(() => {
      if (useKontrollBridge.getState().hello) { setStage('gone'); return; }
      if (nextStep(firstVisit, false) === 'signin') setStage('signin');
      else {
        setStage('leaving');
        window.setTimeout(() => setStage('gone'), 350);
      }
    }, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [hello, stage, firstVisit]);

  // Straight into writing: a new empty script, saved as "Untitled" in Unfiled, with the Projects tab beside it.
  const finish = async () => {
    try { localStorage.setItem(WELCOMED, '1'); } catch { /* private window */ }
    setBusy(true);
    try {
      const unfiled = await ensureUnfiled();
      const list = await api.listScripts(unfiled.id);
      const made = await api.createScript(unfiled.id, { title: nextUntitled(list.map((m) => m.title)), format: 'screenplay' });
      try { sessionStorage.setItem(NAV_TAB_ONCE, 'projects'); } catch { /* the Navigator just opens on Scenes */ }
      if (!useEditorStore.getState().navigatorOpen) useEditorStore.getState().toggleNavigator();
      window.dispatchEvent(new CustomEvent('screenplays:library-changed'));
      navigate(scriptRoute(unfiled.id, made.meta));
    } catch {
      navigate('/projects'); // couldn't make the script: the projects page, as before
    }
    setBusy(false);
    setStage('gone');
  };

  const signIn = async () => {
    setBusy(true);
    setProblem('');
    await connectDrive();
    setBusy(false);
    const st = useDriveStatus.getState();
    if (wasConnectedBefore() && st.state !== 'ready') { void finish(); return; }
    setProblem(st.message ? `Google sign-in didn't finish (${st.message}). Try again, or carry on without signing in.` : 'Google sign-in didn\'t finish. Try again, or carry on without signing in.');
  };

  // Inside Kontroll's Screenplay tab: nothing (Kontroll's hello arrives within moments).
  if (hello || stage === 'gone') return null;

  return (
    <div className={`ww-overlay${stage === 'leaving' ? ' ww-leaving' : ''}`} role="dialog" aria-modal="true" aria-label={APP_NAME}>
      <div className="ww-brand">
        <img className="ww-logo" src={`${import.meta.env.BASE_URL}splash-logo.png`} alt="" />
        <div className="ww-name">{APP_NAME}</div>
        <div className="ww-tagline">Write screenplays together — in your browser</div>
      </div>

      {stage === 'signin' ? (
        <div className="ww-card">
          <p>Sign in with Google to keep your scripts in your own Google Drive, so they&apos;re safe and on every computer you use, and to share them with the people you write with. You only do this once.</p>
          <button type="button" className="ww-google" onClick={() => void signIn()} disabled={busy}>
            <FaGoogle /> {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          {problem && <div className="ww-problem" role="alert">{problem}</div>}
          <button type="button" className="ww-skip" onClick={() => void finish()} disabled={busy}>
            Not now
          </button>
          <div className="ww-skip-note">Without signing in, your scripts stay in this browser only. You can sign in later with Sign in at the top right.</div>
        </div>
      ) : (
        <div className="ww-spinner" aria-hidden="true" />
      )}
      <div className="ww-credit">Built on OpenDraft</div>
    </div>
  );
};

export default WebWelcome;
