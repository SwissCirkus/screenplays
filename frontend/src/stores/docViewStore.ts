/**
 * A Google Doc shown where the script page is (SwissCirkus fork, Christian 2026-11-15: "see the Google Doc in the hero
 * viewer where I see the script"). The script stays loaded underneath; closing the view goes straight back to it.
 */
import { create } from 'zustand';

export interface DocViewState {
  doc: { url: string; name: string } | null;
  show(url: string, name: string): void;
  close(): void;
}

export const useDocView = create<DocViewState>((set) => ({
  doc: null,
  show: (url, name) => set({ doc: { url, name } }),
  close: () => set({ doc: null }),
}));
