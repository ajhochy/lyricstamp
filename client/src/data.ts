// data.ts — sample fixtures for AbleSet Sync
// Ported from design/data.jsx. Replaces window.X = X with ESM exports.
import type { Song } from '../../shared/types';

// ---------------------------------------------------------------------------
// SAMPLE_SONG — starting fixture; shown on first load before the user pastes
// their own ChordPro.
// ---------------------------------------------------------------------------
export const SAMPLE_SONG: Song = {
  name: 'Untitled Worship Song',
  bpm: 76,
  key: 'G',
  // Section headers + lines, using bracketed placeholder text per spec
  lines: [
    { section: 'Intro' },
    { text: '[Intro instrumental — 4 bars]' },
    { section: 'Verse 1' },
    { text: '[Verse 1 line 1]' },
    { text: '[Verse 1 line 2]' },
    { text: '[Verse 1 line 3]' },
    { text: '[Verse 1 line 4]' },
    { section: 'Pre-Chorus' },
    { text: '[Pre-chorus line 1]' },
    { text: '[Pre-chorus line 2]' },
    { section: 'Chorus' },
    { text: '[Chorus line 1]' },
    { text: '[Chorus line 2]' },
    { text: '[Chorus line 3]' },
    { text: '[Chorus line 4]' },
    { section: 'Verse 2' },
    { text: '[Verse 2 line 1]' },
    { text: '[Verse 2 line 2]' },
    { text: '[Verse 2 line 3]' },
    { text: '[Verse 2 line 4]' },
    { section: 'Bridge' },
    { text: '[Bridge line 1]' },
    { text: '[Bridge line 2]' },
    { text: '[Bridge repeat x4]' },
    { section: 'Outro' },
    { text: '[Outro tag — slow halt]' },
  ],
};

// ---------------------------------------------------------------------------
// INITIAL_STAMPS — pre-stamped progress representing a mid-session state.
// Timestamps are in seconds (displayed as M:SS.D).
// This is a local UI shape, not the LyricStamp wire type from shared/types.
// ---------------------------------------------------------------------------
export type InitialStamp = {
  idx: number;
  ts: number;
  sectionStart?: string;
};

export const INITIAL_STAMPS: InitialStamp[] = [
  { idx: 1,  ts: 0.0,    sectionStart: 'Intro' },
  { idx: 1,  ts: 8.4 },
  { idx: 3,  ts: 16.2,   sectionStart: 'Verse 1' },
  { idx: 4,  ts: 22.6 },
  { idx: 5,  ts: 28.9 },
  { idx: 6,  ts: 35.1 },
  { idx: 8,  ts: 42.4,   sectionStart: 'Pre-Chorus' },
  { idx: 9,  ts: 48.8 },
  { idx: 11, ts: 55.2,   sectionStart: 'Chorus' },
  { idx: 12, ts: 61.7 },
  { idx: 13, ts: 68.3 },
];

// ---------------------------------------------------------------------------
// INITIAL_CURSOR — index into SAMPLE_SONG.lines indicating the active line.
// ---------------------------------------------------------------------------
export const INITIAL_CURSOR: number = 14; // Chorus line 4 is queued next

// ---------------------------------------------------------------------------
// LEADSHEET_PAGES — fake chord-chart data for first render before a real PDF
// loads. Keeps the prototype's structure (title, subtitle, sections[]).
// ---------------------------------------------------------------------------
type PdfLine = { chords: string; lyric?: string; current?: boolean };
type PdfSection = { label: string; lines: PdfLine[] };
type PdfPage = { title: string; subtitle: string; sections: PdfSection[] };

export const LEADSHEET_PAGES: PdfPage[] = [
  {
    title: 'Untitled Worship Song',
    subtitle: 'Key of G  ·  76 BPM  ·  4/4',
    sections: [
      { label: 'Intro', lines: [
        { chords: 'G    Cadd9    Em7    D' },
      ]},
      { label: 'Verse 1', lines: [
        { chords: 'G                 Cadd9', lyric: '[Verse 1 line 1]' },
        { chords: 'Em7               D',     lyric: '[Verse 1 line 2]' },
        { chords: 'G                 Cadd9', lyric: '[Verse 1 line 3]' },
        { chords: 'Em7    D    G',           lyric: '[Verse 1 line 4]' },
      ]},
      { label: 'Pre-Chorus', lines: [
        { chords: 'Am7               D',  lyric: '[Pre-chorus line 1]' },
        { chords: 'Cadd9             D',  lyric: '[Pre-chorus line 2]' },
      ]},
      { label: 'Chorus', lines: [
        { chords: 'G                 D/F#',  lyric: '[Chorus line 1]', current: true },
        { chords: 'Em7               Cadd9', lyric: '[Chorus line 2]' },
        { chords: 'G                 D/F#',  lyric: '[Chorus line 3]' },
        { chords: 'Em7    Cadd9    G',       lyric: '[Chorus line 4]' },
      ]},
    ],
  },
  {
    title: 'Untitled Worship Song',
    subtitle: 'Key of G  ·  76 BPM  ·  4/4  ·  pg. 2',
    sections: [
      { label: 'Verse 2', lines: [
        { chords: 'G                 Cadd9', lyric: '[Verse 2 line 1]' },
        { chords: 'Em7               D',     lyric: '[Verse 2 line 2]' },
        { chords: 'G                 Cadd9', lyric: '[Verse 2 line 3]' },
        { chords: 'Em7    D    G',           lyric: '[Verse 2 line 4]' },
      ]},
      { label: 'Bridge', lines: [
        { chords: 'Cadd9    G/B    Am7    D', lyric: '[Bridge line 1]' },
        { chords: 'Cadd9    G/B    Am7    D', lyric: '[Bridge line 2]' },
        { chords: 'Cadd9    G/B    Am7    D', lyric: '[Bridge repeat x4]' },
      ]},
      { label: 'Outro', lines: [
        { chords: 'G    Cadd9    G', lyric: '[Outro tag — slow halt]' },
      ]},
    ],
  },
];

// ---------------------------------------------------------------------------
// INITIAL_LEADSHEET_STAMPS — pre-stamped leadsheet entries (local UI shape).
// ---------------------------------------------------------------------------
export type InitialLeadsheetStamp = {
  page: number;
  region: string;
  ts: number;
};

export const INITIAL_LEADSHEET_STAMPS: InitialLeadsheetStamp[] = [
  { page: 1, region: 'Intro',       ts: 0.0  },
  { page: 1, region: 'Verse 1 L1',  ts: 16.2 },
  { page: 1, region: 'Verse 1 L2',  ts: 22.6 },
  { page: 1, region: 'Verse 1 L3',  ts: 28.9 },
  { page: 1, region: 'Verse 1 L4',  ts: 35.1 },
  { page: 1, region: 'Pre L1',      ts: 42.4 },
  { page: 1, region: 'Pre L2',      ts: 48.8 },
  { page: 1, region: 'Chorus L1',   ts: 55.2 },
];
