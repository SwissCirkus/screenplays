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
}

/** Left padding (px) that centres the buttons over `targetCenter`. */
export function toolbarLeadPadding({ toolbarWidth, basePad, contentWidth, targetCenter }: ToolbarLeadInput): number {
  if (![toolbarWidth, basePad, contentWidth, targetCenter].every(Number.isFinite)) return basePad;
  const maxLead = toolbarWidth - basePad - contentWidth;
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
  const visible = Array.from(toolbar.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.offsetWidth > 0,
  );
  if (!target || visible.length === 0) return;
  const barRect = toolbar.getBoundingClientRect();
  const first = visible[0].getBoundingClientRect();
  const last = visible[visible.length - 1].getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const lead = toolbarLeadPadding({
    toolbarWidth: barRect.width,
    basePad,
    contentWidth: last.right - first.left,
    targetCenter: targetRect.left + targetRect.width / 2 - barRect.left,
  });
  if (lead !== basePad) toolbar.style.paddingLeft = `${lead}px`;
}
