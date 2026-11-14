/**
 * Web build only (SwissCirkus fork, Christian 2026-11-15): make the online writer start like an app.
 *  - Every start: a short splash with the name.
 *  - First visit: a sign-in card — Sign in with Google (your scripts are kept in your own Google Drive) or carry on
 *    without (kept in this browser only). Either way it then opens the projects page, where scripts can be dropped in.
 *  - Inside Kontroll's Screenplay tab none of this shows (Kontroll says hello within moments of the page loading; the
 *    splash only fades in after that).
 * English only on purpose: this exists only on the SwissCirkus web build. // i18n-ignore
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaGoogle } from 'react-icons/fa';
import { useKontrollBridge } from '../services/kontrollBridge';
import { connectDrive, useDriveStatus, wasConnectedBefore } from '../services/driveSync';
import { APP_NAME, nextStep } from './webWelcomeSteps';
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

  const finish = () => {
    try { localStorage.setItem(WELCOMED, '1'); } catch { /* private window */ }
    setStage('gone');
    navigate('/projects');
  };

  const signIn = async () => {
    setBusy(true);
    setProblem('');
    await connectDrive();
    setBusy(false);
    const st = useDriveStatus.getState();
    if (wasConnectedBefore() && st.state !== 'ready') { finish(); return; }
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
          <p>Sign in with Google to keep your scripts in your own Google Drive, so they&apos;re safe and on every computer you use. Only you can see them.</p>
          <button type="button" className="ww-google" onClick={() => void signIn()} disabled={busy}>
            <FaGoogle /> {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          {problem && <div className="ww-problem" role="alert">{problem}</div>}
          <button type="button" className="ww-skip" onClick={finish} disabled={busy}>
            Carry on without signing in (scripts stay in this browser only)
          </button>
        </div>
      ) : (
        <div className="ww-spinner" aria-hidden="true" />
      )}
      <div className="ww-credit">Built on OpenDraft</div>
    </div>
  );
};

export default WebWelcome;
