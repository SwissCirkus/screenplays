/**
 * A Google Doc shown where the script page is (SwissCirkus fork, Christian 2026-11-15: "see the Google Doc in the hero
 * viewer where I see the script"). The script stays loaded underneath; closing the view goes straight back to it.
 * Side by side ("so I could have them side by side"): the Doc on the right of the script, its width dragged by hand.
 */
import { create } from 'zustand';

const SPLIT_KEY = 'screenplays:docSplit';
const WIDTH_KEY = 'screenplays:docSplitWidth';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } };

export const DOC_SPLIT_MIN = 280;

export interface DocViewState {
  doc: { url: string; name: string } | null;
  split: boolean;
  /** The Doc's width when side by side, in pixels. */
  splitWidth: number;
  show(url: string, name: string): void;
  close(): void;
  setSplit(on: boolean): void;
  setSplitWidth(px: number): void;
}

export const useDocView = create<DocViewState>((set) => ({
  doc: null,
  split: read(SPLIT_KEY) === '1',
  splitWidth: Math.max(DOC_SPLIT_MIN, Number(read(WIDTH_KEY)) || 560),
  show: (url, name) => set({ doc: { url, name } }),
  close: () => set({ doc: null }),
  setSplit: (on) => { write(SPLIT_KEY, on ? '1' : '0'); set({ split: on }); },
  setSplitWidth: (px) => { const w = Math.max(DOC_SPLIT_MIN, Math.round(px)); write(WIDTH_KEY, String(w)); set({ splitWidth: w }); },
}));
