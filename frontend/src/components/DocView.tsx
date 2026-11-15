/**
 * A Google Doc in place of the script page (SwissCirkus fork, Christian 2026-11-15). Two ways to show it:
 *  - Live: Google's own Docs page — read and edit as in Google Docs. Needs the browser to let this page use the writer's
 *    Google sign-in (Kontroll's tab does; a browser that blocks third-party cookies shows Google's sign-in instead).
 *  - Readable copy: the Doc's text and formatting, read through Google Docs access (set up once). Works anywhere; read only.
 * The choice is remembered. Esc or "Back to script" closes it.
 * English only on purpose: this exists only on the SwissCirkus fork. // i18n-ignore
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaArrowLeft, FaExternalLinkAlt, FaGoogleDrive } from 'react-icons/fa';
import { useDocView } from '../stores/docViewStore';
import { openLinkInNewTab } from '../services/projectLinks';
import { readDocHtml, setUpDocsAccess, useDocsAccess } from '../services/googleDocsAccess';
import { docViewMode, liveDocUrl, saveDocViewMode, type DocViewMode } from './docViewMode';
import './DocView.css';

const DocView: React.FC = () => {
  const doc = useDocView((s) => s.doc);
  const close = useDocView((s) => s.close);
  const docsOn = useDocsAccess((s) => s.on);
  const docsMessage = useDocsAccess((s) => s.message);
  const [mode, setMode] = useState<DocViewMode>(docViewMode);
  const [copy, setCopy] = useState<{ url: string; html: string } | null>(null);
  const [problem, setProblem] = useState('');

  // Opening another script or page closes the Doc.
  const { pathname } = useLocation();
  const shownAt = useRef(pathname);
  useEffect(() => { if (doc) shownAt.current = pathname; }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doc && pathname !== shownAt.current) close(); }, [pathname, doc, close]);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, close]);

  // The readable copy: fetched when that mode shows a Doc it doesn't have yet.
  useEffect(() => {
    if (!doc || mode !== 'copy' || !docsOn || copy?.url === doc.url) return;
    let live = true;
    readDocHtml(doc.url)
      .then((html) => { if (live) { setCopy({ url: doc.url, html }); setProblem(''); } })
      .catch((e) => { if (live) setProblem(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [doc, mode, docsOn, copy]);

  if (!doc) return null;
  const pick = (m: DocViewMode) => { setMode(m); saveDocViewMode(m); setProblem(''); };
  const copyHere = copy?.url === doc.url ? copy.html : null;

  return (
    <div className="doc-view" role="region" aria-label={`Google Doc: ${doc.name}`}>
      <div className="doc-view-bar">
        <button type="button" className="doc-view-btn" onClick={close} title="Back to the script (Esc)">
          <FaArrowLeft /> {'Back to script' /* i18n-ignore */}
        </button>
        <span className="doc-view-name" title={doc.url}>{'📄'} {doc.name}</span>
        <div className="doc-view-modes" role="radiogroup" aria-label="How to show the Doc">
          <button type="button" role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => pick('live')}
            title="Google's own Docs page — read and edit here">{'Live Doc' /* i18n-ignore */}</button>
          <button type="button" role="radio" aria-checked={mode === 'copy'} className={mode === 'copy' ? 'on' : ''} onClick={() => pick('copy')}
            title="A readable copy — works in any browser, read only">{'Readable copy' /* i18n-ignore */}</button>
        </div>
        <button type="button" className="doc-view-btn" onClick={() => openLinkInNewTab(doc.url)} title="Open the Doc in its own tab">
          <FaExternalLinkAlt /> {'Open in new tab' /* i18n-ignore */}
        </button>
      </div>

      {mode === 'live' ? (
        <>
          <iframe
            key={doc.url}
            className="doc-view-frame"
            src={liveDocUrl(doc.url)}
            title={doc.name}
            allow="clipboard-read; clipboard-write"
          />
          <div className="doc-view-hint">
            {'Not showing, or asking you to sign in? Some browsers keep Google out of other pages — choose Readable copy, or Open in new tab.' /* i18n-ignore */}
          </div>
        </>
      ) : !docsOn ? (
        <div className="doc-view-setup">
          <p>{'The readable copy is read through Google Docs access — a one-time setup (the same one the Script Assistant uses).' /* i18n-ignore */}</p>
          <button type="button" className="doc-view-btn primary" onClick={() => void setUpDocsAccess()}>
            <FaGoogleDrive /> {'Set up Google Docs access' /* i18n-ignore */}
          </button>
          {docsMessage && <div className="doc-view-problem">{`Google said: ${docsMessage}` /* i18n-ignore */}</div>}
        </div>
      ) : problem ? (
        <div className="doc-view-setup"><div className="doc-view-problem">{`Couldn't read “${doc.name}”: ${problem}` /* i18n-ignore */}</div></div>
      ) : copyHere === null ? (
        <div className="doc-view-setup"><p>{'Reading the Doc…' /* i18n-ignore */}</p></div>
      ) : (
        // No scripts run in the copy; its links open in a new tab.
        <iframe className="doc-view-frame doc-view-copy" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={copyHere} title={doc.name} />
      )}
    </div>
  );
};

export default DocView;
