/** SwissCirkus web build: the name on the splash, and what follows it (kept apart from the component for fast refresh). */
export const APP_NAME = 'Screenplays';

/** The Navigator tab to open once, on the first script after the welcome (sessionStorage key; SceneNavigator reads it). */
export const NAV_TAB_ONCE = 'screenplays:navTabOnce';

/** Where the splash goes next. */
export function nextStep(firstVisit: boolean, inKontroll: boolean): 'none' | 'signin' {
  if (inKontroll) return 'none';
  return firstVisit ? 'signin' : 'none';
}
