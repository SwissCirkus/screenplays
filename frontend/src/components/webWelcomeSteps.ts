/** SwissCirkus web build: the name on the splash, and what follows it (kept apart from the component for fast refresh). */
export const APP_NAME = 'Screenplays';

/** Where the splash goes next. */
export function nextStep(firstVisit: boolean, inKontroll: boolean): 'none' | 'signin' {
  if (inKontroll) return 'none';
  return firstVisit ? 'signin' : 'none';
}
