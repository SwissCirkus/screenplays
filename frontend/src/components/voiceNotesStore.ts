/** Whether the Voice notes panel is open (Tools › Voice notes into a Google Doc…). */
import { create } from 'zustand';

export const useVoiceNotes = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
