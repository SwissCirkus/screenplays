/**
 * Centre the formatting toolbar over the page rather than the window.
 *
 * The toolbar spans the whole window (above the Navigator and the right-hand
 * panels too), so plain `justify-content: center` would centre it on the
 * window and drift off the page whenever a side panel is open. Instead the
 * toolbar's left padding is set so the middle of its buttons sits over the
 * middle of the page, clamped so the buttons never leave the bar. When the
 * bar is too narrow for that, it falls back to hugging the left edge, exactly
 * as before, so no extra buttons fold into the "…" menu.
 */
export interface ToolbarLeadInput {
  /** Toolbar width (border box), px. */
  toolbarWidth: number;
  /** The stylesheet's own left/right padding, px. */
  basePad: number;
  /** Width of the visible buttons from the first to the last, px. */
  contentWidth: number;
  /** Middle of the page, measured from the toolbar's left edge, px. */
  targetCenter: number;
  /** Room kept free at the right for the controls that stay there (the "…" menu, zoom), px. */
  reserveRight?: number;
}

/** Left padding (px) that centres the buttons over `targetCenter`. */
export function toolbarLeadPadding({ toolbarWidth, basePad, contentWidth, targetCenter, reserveRight = 0 }: ToolbarLeadInput): number {
  if (![toolbarWidth, basePad, contentWidth, targetCenter, reserveRight].every(Number.isFinite)) return basePad;
  const maxLead = toolbarWidth - basePad - contentWidth - reserveRight;
  if (maxLead <= basePad) return basePad;
  const wanted = targetCenter - contentWidth / 2;
  return Math.round(Math.min(maxLead, Math.max(basePad, wanted)));
}

/** The element whose middle the toolbar lines up with: the page, else the editor area. */
export function toolbarCenterTarget(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>('.editor-main .page-sizer')
    ?? root.querySelector<HTMLElement>('.editor-main');
}

/**
 * Re-centre `toolbar` over the page. Leaves the stylesheet's padding alone
 * when the bar wraps onto several rows (phones), where centring one row
 * makes no sense.
 */
export function centerToolbarOverPage(toolbar: HTMLElement): void {
  toolbar.style.paddingLeft = '';
  const style = getComputedStyle(toolbar);
  if (style.flexWrap !== 'nowrap') return;
  const basePad = parseFloat(style.paddingLeft) || 0;
  const target = toolbarCenterTarget(toolbar.ownerDocument);
  // Only the formatting tools are centred: those before the stretchy spacer. The spacer itself always fills the
  // slack (so centring "everything" never moved anything), the "…" menu and zoom after it stay at the right, and the
  // Navigator ☰ is pinned to the left edge (absolutely placed; the stylesheet's padding leaves it room).
  const children = Array.from(toolbar.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const spacerAt = children.findIndex((el) => el.classList.contains('toolbar-spacer'));
  const shown = (el: HTMLElement) => el.offsetWidth > 0 && !el.classList.contains('toolbar-pinned-left');
  const centred = (spacerAt >= 0 ? children.slice(0, spacerAt) : children).filter(shown);
  const right = (spacerAt >= 0 ? children.slice(spacerAt + 1) : []).filter(shown);
  if (!target || centred.length === 0) return;
  const barRect = toolbar.getBoundingClientRect();
  const first = centred[0].getBoundingClientRect();
  const last = centred[centred.length - 1].getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const gap = parseFloat(style.columnGap) || 0;
  const lead = toolbarLeadPadding({
    toolbarWidth: barRect.width,
    basePad,
    contentWidth: last.right - first.left,
    targetCenter: targetRect.left + targetRect.width / 2 - barRect.left,
    reserveRight: right.reduce((sum, el) => sum + el.offsetWidth + gap, 0) + gap,
  });
  if (lead !== basePad) toolbar.style.paddingLeft = `${lead}px`;
}
