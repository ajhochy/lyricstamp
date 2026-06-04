// data.ts — app data shapes and empty-session defaults.
import type { Song } from '../../shared/types';

// ---------------------------------------------------------------------------
// EMPTY_SONG — the clean starting state. The app opens with no song loaded;
// the user pastes ChordPro and clicks "Reload song" to populate it.
// ---------------------------------------------------------------------------
export const EMPTY_SONG: Song = {
  name: '',
  bpm: 120,
  key: 'C',
  lines: [],
};

// ---------------------------------------------------------------------------
// InitialStamp — the local UI shape for a lyric stamp (not the LyricStamp wire
// type from shared/types). Timestamps are in beats (AbletonOSC current_song_time).
// ---------------------------------------------------------------------------
export type InitialStamp = {
  idx: number;
  ts: number;
  sectionStart?: string;
};
