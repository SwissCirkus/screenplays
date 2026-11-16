import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initialsOf } from './AuthIndicator';
import { driveMenuLabel } from '../services/driveSync';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Christian 2026-11-16: "declutter that bar … just have share and signed in as … a round circle, just a CG for me … save to drive
// should just come up the first time you sign in, and then maybe … under tools".
describe('the top bar: Share and your initials', () => {
  it('initials in the circle', () => {
    expect(initialsOf('Christian Greet', 'c@example.com')).toBe('CG');
    expect(initialsOf('Marshall', null)).toBe('M');
    expect(initialsOf('Anna-Lena von Berg')).toBe('AB');
    expect(initialsOf('', 'zoe@example.com')).toBe('Z');
    expect(initialsOf('  ', '')).toBe('?');
  });

  it('web build: no Script Assistant button and no Drive button up top; Drive in Tools and the initials menu', () => {
    const m = src('./MenuBar.tsx');
    expect(m.includes('className="menu-assistant-btn"\n')).toBe(false);
    expect(m.includes("addons:scriptAssistant.button")).toBe(false);
    expect(m.includes('{browserLibrary() ? (collabServerHttp() ? <AuthIndicator compact /> : <DriveIndicator />) : <AuthIndicator />}')).toBe(true);
    expect(m.includes("icon: <FaGoogleDrive />, label: driveMenuLabel(driveState), action: () => { void connectDrive(); }")).toBe(true);
    const a = src('./AuthIndicator.tsx');
    expect(a.includes("{compact && !driveOk && <span className=\"auth-indicator__dot\" aria-hidden=\"true\" />}")).toBe(true);
    expect(a.includes("const signInNow = async () => { if (busy) return; if (await checkOneStep()) void connectDrive(); else setLoginOpen(true); };")).toBe(true); // Sign in = the one Google window
    expect(driveMenuLabel('synced')).toBe('Google Drive: saved');
    expect(driveMenuLabel('ready')).toBe('Connect Google Drive…');
  });
});
