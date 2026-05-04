// AbleSet Sync — sample song data + leadsheet content
const SAMPLE_SONG = {
  name: "Untitled Worship Song",
  bpm: 76,
  key: "G",
  // Section headers + lines, using bracketed placeholder text per spec
  lines: [
    { section: "Intro" },
    { text: "[Intro instrumental — 4 bars]" },
    { section: "Verse 1" },
    { text: "[Verse 1 line 1]" },
    { text: "[Verse 1 line 2]" },
    { text: "[Verse 1 line 3]" },
    { text: "[Verse 1 line 4]" },
    { section: "Pre-Chorus" },
    { text: "[Pre-chorus line 1]" },
    { text: "[Pre-chorus line 2]" },
    { section: "Chorus" },
    { text: "[Chorus line 1]" },
    { text: "[Chorus line 2]" },
    { text: "[Chorus line 3]" },
    { text: "[Chorus line 4]" },
    { section: "Verse 2" },
    { text: "[Verse 2 line 1]" },
    { text: "[Verse 2 line 2]" },
    { text: "[Verse 2 line 3]" },
    { text: "[Verse 2 line 4]" },
    { section: "Bridge" },
    { text: "[Bridge line 1]" },
    { text: "[Bridge line 2]" },
    { text: "[Bridge repeat x4]" },
    { section: "Outro" },
    { text: "[Outro tag — slow halt]" },
  ],
};

// Pre-stamped progress representing a mid-session state (timestamps shown as seconds.ms)
// Timestamps are in seconds — display formatted as M:SS.D
const INITIAL_STAMPS = [
  { idx: 1,  ts: 0.0,    sectionStart: "Intro" },
  { idx: 1,  ts: 8.4 },
  { idx: 3,  ts: 16.2,   sectionStart: "Verse 1" },
  { idx: 4,  ts: 22.6 },
  { idx: 5,  ts: 28.9 },
  { idx: 6,  ts: 35.1 },
  { idx: 8,  ts: 42.4,   sectionStart: "Pre-Chorus" },
  { idx: 9,  ts: 48.8 },
  { idx: 11, ts: 55.2,   sectionStart: "Chorus" },
  { idx: 12, ts: 61.7 },
  { idx: 13, ts: 68.3 },
];

// The "current" cursor — what line is showing now
const INITIAL_CURSOR = 14; // Chorus line 4 is queued next; current shown is line 13 highlighted

// PDF leadsheet content — chord chart placeholder
const LEADSHEET_PAGES = [
  {
    title: "Untitled Worship Song",
    subtitle: "Key of G  ·  76 BPM  ·  4/4",
    sections: [
      { label: "Intro", lines: [
        { chords: "G    Cadd9    Em7    D" },
      ]},
      { label: "Verse 1", lines: [
        { chords: "G                 Cadd9", lyric: "[Verse 1 line 1]" },
        { chords: "Em7               D", lyric: "[Verse 1 line 2]" },
        { chords: "G                 Cadd9", lyric: "[Verse 1 line 3]" },
        { chords: "Em7    D    G", lyric: "[Verse 1 line 4]" },
      ]},
      { label: "Pre-Chorus", lines: [
        { chords: "Am7               D",  lyric: "[Pre-chorus line 1]" },
        { chords: "Cadd9             D",  lyric: "[Pre-chorus line 2]" },
      ]},
      { label: "Chorus", lines: [
        { chords: "G                 D/F#",  lyric: "[Chorus line 1]", current: true },
        { chords: "Em7               Cadd9", lyric: "[Chorus line 2]" },
        { chords: "G                 D/F#",  lyric: "[Chorus line 3]" },
        { chords: "Em7    Cadd9    G", lyric: "[Chorus line 4]" },
      ]},
    ],
  },
  {
    title: "Untitled Worship Song",
    subtitle: "Key of G  ·  76 BPM  ·  4/4  ·  pg. 2",
    sections: [
      { label: "Verse 2", lines: [
        { chords: "G                 Cadd9", lyric: "[Verse 2 line 1]" },
        { chords: "Em7               D",     lyric: "[Verse 2 line 2]" },
        { chords: "G                 Cadd9", lyric: "[Verse 2 line 3]" },
        { chords: "Em7    D    G",  lyric: "[Verse 2 line 4]" },
      ]},
      { label: "Bridge", lines: [
        { chords: "Cadd9    G/B    Am7    D", lyric: "[Bridge line 1]" },
        { chords: "Cadd9    G/B    Am7    D", lyric: "[Bridge line 2]" },
        { chords: "Cadd9    G/B    Am7    D", lyric: "[Bridge repeat x4]" },
      ]},
      { label: "Outro", lines: [
        { chords: "G    Cadd9    G", lyric: "[Outro tag — slow halt]" },
      ]},
    ],
  },
];

// Pre-stamped leadsheet entries
const INITIAL_LEADSHEET_STAMPS = [
  { page: 1, region: "Intro",       ts: 0.0  },
  { page: 1, region: "Verse 1 L1",  ts: 16.2 },
  { page: 1, region: "Verse 1 L2",  ts: 22.6 },
  { page: 1, region: "Verse 1 L3",  ts: 28.9 },
  { page: 1, region: "Verse 1 L4",  ts: 35.1 },
  { page: 1, region: "Pre L1",      ts: 42.4 },
  { page: 1, region: "Pre L2",      ts: 48.8 },
  { page: 1, region: "Chorus L1",   ts: 55.2 },
];

window.SAMPLE_SONG = SAMPLE_SONG;
window.INITIAL_STAMPS = INITIAL_STAMPS;
window.INITIAL_CURSOR = INITIAL_CURSOR;
window.LEADSHEET_PAGES = LEADSHEET_PAGES;
window.INITIAL_LEADSHEET_STAMPS = INITIAL_LEADSHEET_STAMPS;
