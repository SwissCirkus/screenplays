import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nextStep, APP_NAME } from './webWelcomeSteps';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// SwissCirkus web build (Christian 2026-11-15): start like an app, sign in on the first visit, then the projects page.
describe('web welcome', () => {
  it('asks to sign in only on the first visit, and never inside Kontroll', () => {
    expect(nextStep(true, false)).toBe('signin');
    expect(nextStep(false, false)).toBe('none');
    expect(nextStep(true, true)).toBe('none');
    expect(APP_NAME).toBe('Screenplays');
  });

  it('shows only in the web build, signs in through Google Drive and then opens the projects page', () => {
    expect(src('../App.tsx')).toMatch(/\{browserLibrary\(\) && <WebWelcome \/>\}/);
    const w = src('./WebWelcome.tsx');
    expect(w).toMatch(/await connectDrive\(\);/);
    expect(w).toMatch(/navigate\('\/projects'\);/);
    expect(w).toMatch(/if \(hello \|\| stage === 'gone'\) return null;/);
  });

  it('turns the Script Assistant on in the web build too', () => {
    expect(src('../services/browserLibraryInit.ts')).toMatch(/autoEnableAssistant\(\);/);
  });

  it('Table Read uses Kontroll’s white round play button and thin ring sliders', () => {
    const css = src('../styles/tableRead.css');
    expect(css).toMatch(/\.table-read-play \{\s*width: 40px;[^}]*border-radius: 50%;[^}]*background: #fff; color: #111;/);
    expect(css).toMatch(/::-webkit-slider-runnable-track[^{]*\{\s*height: 1px;/);
    expect(css).toMatch(/::-webkit-slider-thumb[^{]*\{[^}]*width: 10px; height: 10px; border-radius: 50%;[^}]*background: transparent;/);
  });
});
