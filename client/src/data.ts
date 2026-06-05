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
  /**
   * Optional per-stamp lyric override. When set, it is shown in the stamp log
   * and used as the clip name on export, instead of the parsed song line text.
   * Lets the user correct a single stamp's lyric without re-parsing the song.
   */
  text?: string;
};
