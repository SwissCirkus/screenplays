/**
 * Side-panel widths that stay as the writer left them (SwissCirkus fork).
 *
 * The Navigator (left) and the panel column on the right used to start at a
 * fixed width every time the editor came up — switching script, or leaving
 * the Screenplay tab and coming back — so a Navigator the writer had widened
 * snapped narrow again and hid some of its tabs. The width they drag (or set
 * with the arrow keys) is now kept on this device. Until they set one, the
 * Navigator opens wide enough to show every tab.
 */
export const NAV_MIN = 160;
export const NAV_MAX = 640;
export const RIGHT_MIN = 200;
export const RIGHT_MAX = 600;
/** Used only until the tab strip can be measured. */
export const NAV_FALLBACK = 240;

const KEYS = { left: 'swisscirkus:navigator-width', right: 'swisscirkus:right-panel-width' } as const;
type Side = keyof typeof KEYS;

export function clampPanelWidth(side: Side, width: number): number {
  const [min, max] = side === 'left' ? [NAV_MIN, NAV_MAX] : [RIGHT_MIN, RIGHT_MAX];
  return Math.round(Math.max(min, Math.min(max, width)));
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function store(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The width the writer left this panel at, or null when they never set one. */
export function loadPanelWidth(side: Side, s: Store | null = store()): number | null {
  try {
    const raw = s?.getItem(KEYS[side]);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? clampPanelWidth(side, n) : null;
  } catch {
    return null;
  }
}

export function savePanelWidth(side: Side, width: number, s: Store | null = store()): void {
  try { s?.setItem(KEYS[side], String(clampPanelWidth(side, width))); } catch { /* private mode: kept for this visit only */ }
}

/**
 * The Navigator width that shows all of its tabs without scrolling: the tab
 * strip's full width plus the close button, measured from the panel itself
 * (so it follows the language and the interface size).
 */
export function navigatorWidthForAllTabs(panel: ParentNode | null): number | null {
  const strip = panel?.querySelector<HTMLElement>('.navigator-tabs-scroll');
  if (!strip) return null;
  // The tabs stretch to fill the strip, so measure them at their natural
  // width — never the current one, or a strip that already fits would ask for
  // a little more on every measure.
  const before = { width: strip.style.width, flex: strip.style.flex };
  strip.style.width = 'max-content';
  strip.style.flex = 'none';
  const natural = Math.ceil(strip.getBoundingClientRect().width);
  strip.style.width = before.width;
  strip.style.flex = before.flex;
  if (natural <= 0) return null;
  const close = panel?.querySelector<HTMLElement>('.navigator-close');
  return clampPanelWidth('left', natural + (close?.offsetWidth ?? 28) + 4);
}
