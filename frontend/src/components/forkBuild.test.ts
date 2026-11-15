import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// SwissCirkus fork (Christian 2026-11-15): our own build shows under OpenDraft's version in Help › About.
describe('fork build stamp', () => {
  it('About shows the build number, commit and date that publish-pages.sh stamps', () => {
    const menu = readFileSync(new URL('./MenuBar.tsx', import.meta.url), 'utf8');
    expect(menu).toMatch(/<div className="about-version">Version 2\.12\.0<\/div>\s*\{\/\* SwissCirkus fork[^]*?import\.meta\.env\.VITE_SC_BUILD && \(/);
    expect(menu).toMatch(/SwissCirkus Screenplays · build \$\{import\.meta\.env\.VITE_SC_BUILD\}/);
    const script = readFileSync(new URL('../../../publish-pages.sh', import.meta.url), 'utf8');
    expect(script).toMatch(/SC_BUILD="\$\(git rev-list --count HEAD\)"/);
    expect(script).toMatch(/VITE_SC_BUILD="\$SC_BUILD" VITE_SC_COMMIT="\$SC_COMMIT" VITE_SC_DATE="\$SC_DATE" npx vite build/);
  });
});
