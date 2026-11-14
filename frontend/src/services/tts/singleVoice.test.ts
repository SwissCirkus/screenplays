import { afterEach, describe, expect, it } from 'vitest';
import { voiceFor } from './player';
import { useVoiceSettingsStore, DEFAULT_TABLE_READ_OPTIONS } from '../../stores/voiceSettingsStore';
import type { ReadLine } from './script';
import type { Casting } from './voiceAssign';

// Single voice (SwissCirkus fork, Christian 2026-11-15): the narrator reads everything, like a narrated reading.
const casting = { narrator: 'narr', bySpeaker: new Map([['JOHN', 'john-voice']]) } as unknown as Casting;
const line = (kind: string, speaker: string | null) => ({ index: 0, kind, speaker, cue: speaker, text: 'x', spoken: 'x' }) as unknown as ReadLine;

afterEach(() => useVoiceSettingsStore.getState().setOptions({ singleVoice: false }));

describe('Table Read single voice', () => {
  it('is off by default, so every character keeps their own voice', () => {
    expect(DEFAULT_TABLE_READ_OPTIONS.singleVoice).toBe(false);
    expect(voiceFor(line('dialogue', 'JOHN'), casting)).toBe('john-voice');
    expect(voiceFor(line('action', null), casting)).toBe('narr');
  });

  it('when ticked, the narrator reads the characters’ lines too', () => {
    useVoiceSettingsStore.getState().setOptions({ singleVoice: true });
    expect(voiceFor(line('dialogue', 'JOHN'), casting)).toBe('narr');
    expect(voiceFor(line('lyrics', 'JOHN'), casting)).toBe('narr');
    expect(voiceFor(line('action', null), casting)).toBe('narr');
  });

  it('is remembered with the other Table Read options', () => {
    useVoiceSettingsStore.getState().setOptions({ singleVoice: true });
    expect(JSON.parse(localStorage.getItem('opendraft:tableRead')!).options.singleVoice).toBe(true);
  });
});
