/**
 * DriveIndicator — SwissCirkus fork. Replaces the "Local only" account chip on
 * the web: shows whether the library is mirrored to Google Drive, and connects
 * it on click (Google's sign-in popup needs the click).
 */
import React from 'react';
import { FaGoogleDrive } from 'react-icons/fa';
import { connectDrive, useDriveStatus } from '../services/driveSync';


const DriveIndicator: React.FC = () => {
  const { state, message, pending, lastSaved } = useDriveStatus();
  const unsaved = pending > 0 ? ` · ${pending} to save` : '';
  const label =
    state === 'connecting' ? 'Connecting…'
    : state === 'saving' ? 'Saving to Drive…'
    : state === 'synced' ? 'Saved to Drive'
    : state === 'expired' ? `Reconnect Drive${unsaved}`
    : state === 'error' ? 'Drive error'
    : `Connect Google Drive${unsaved}`;
  const title =
    state === 'synced' ? `Everything is in your Google Drive, in the Screenplays folder${lastSaved ? ` (last saved ${new Date(lastSaved).toLocaleTimeString()})` : ''}.`
    : state === 'error' ? `${message}\nClick to try again.`
    : state === 'expired' ? 'Google sign-in ran out. Click to reconnect; your work is safe in this browser meanwhile.'
    : 'Your scripts are saved in this browser. Connect Google Drive to keep them in your Drive, in a Screenplays folder.';
  const clickable = state === 'ready' || state === 'expired' || state === 'error';
  return (
    <button
      type="button"
      className={`auth-indicator ${state === 'synced' ? 'auth-indicator--signed-in' : 'auth-indicator--local'}`}
      onClick={() => { if (clickable) void connectDrive(); }}
      title={title}
      aria-live="polite"
    >
      <FaGoogleDrive style={{ opacity: state === 'synced' ? 1 : 0.6 }} />
      <span>{label}</span>
    </button>
  );
};

export default DriveIndicator;
