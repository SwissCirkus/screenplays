/**
 * Places the formatting toolbar and its Navigator ☰ are drawn into (SwissCirkus fork, Christian 2026-11-15: "collapse it
 * down into one layer"). The docked menu bar offers its middle (between Help and the Assistant / account buttons) and the
 * writing area offers its top-left corner; the Toolbar portals into them while they exist, and draws in place otherwise
 * (the floating menu on phones, history mode).
 */
import { create } from 'zustand';

interface ChromeSlots {
  /** The middle of the docked menu bar: the formatting tools go here, so menus and tools share one row. */
  toolbarSlot: HTMLElement | null;
  /** The writing area's top-left corner, right of the Navigator: the ☰ that opens and closes the Navigator. */
  navCorner: HTMLElement | null;
  setToolbarSlot(el: HTMLElement | null): void;
  setNavCorner(el: HTMLElement | null): void;
}

export const useChromeSlots = create<ChromeSlots>((set) => ({
  toolbarSlot: null,
  navCorner: null,
  setToolbarSlot: (el) => set({ toolbarSlot: el }),
  setNavCorner: (el) => set({ navCorner: el }),
}));
