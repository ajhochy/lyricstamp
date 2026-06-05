import { describe, it, expect } from 'vitest';
import { parseChordPro } from './chordpro.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SIMPLE_SONG = `
{title: Amazing Grace}
{key: G}
{tempo: 76}

{start_of_verse}
[G]Amazing [G7]grace how [C]sweet the [G]sound
[G]That saved a [G7]wretch [C]like [G]me
{end_of_verse}

{start_of_chorus}
[C]How precious [G]did that grace appear
[D]The hour I [G]first believed
{end_of_chorus}
`.trim();

const MULTI_SECTION_SONG = `
{title: Blessed Be Your Name}
{key: A}
{tempo: 140}

{start_of_verse: label="Verse 1"}
[A]Blessed be Your [E]name
[F#m]In the land that is [D]plentiful
{end_of_verse}

{start_of_bridge}
[A]You give and take a[E]way
[F#m]You give and take a[D]way
{end_of_bridge}
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseChordPro', () => {
  describe('directives', () => {
    it('extracts {title} into song name when no name arg given', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      expect(song.name).toBe('Amazing Grace');
    });

    it('caller-supplied name takes precedence over {title}', () => {
      const song = parseChordPro('Custom Name', SIMPLE_SONG);
      expect(song.name).toBe('Custom Name');
    });

    it('extracts {key} directive', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      expect(song.key).toBe('G');
    });

    it('extracts {tempo} as numeric bpm', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      expect(song.bpm).toBe(76);
    });

    it('defaults bpm to 120 when no {tempo} directive', () => {
      const noTempo = `
{title: No Tempo Song}
{start_of_verse}
Some lyrics
{end_of_verse}
`.trim();
      const song = parseChordPro('', noTempo);
      expect(song.bpm).toBe(120);
    });

    it('defaults key to C when no {key} directive', () => {
      const noKey = `
{title: No Key Song}
{start_of_verse}
Some lyrics
{end_of_verse}
`.trim();
      const song = parseChordPro('', noKey);
      expect(song.key).toBe('C');
    });
  });

  describe('section markers', () => {
    it('emits a section entry for {start_of_verse}', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      const sections = song.lines.filter((l) => 'section' in l);
      expect(sections.length).toBeGreaterThanOrEqual(1);
      const verseSection = sections.find((l) => l.section?.toLowerCase().includes('verse'));
      expect(verseSection).toBeDefined();
    });

    it('emits a section entry for {start_of_chorus}', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      const sections = song.lines.filter((l) => 'section' in l);
      const chorusSection = sections.find((l) => l.section?.toLowerCase().includes('chorus'));
      expect(chorusSection).toBeDefined();
    });

    it('uses the label attribute from {start_of_verse: label="..."}', () => {
      const song = parseChordPro('', MULTI_SECTION_SONG);
      const sections = song.lines.filter((l) => 'section' in l);
      const verse1 = sections.find((l) => l.section === 'Verse 1');
      expect(verse1).toBeDefined();
    });

    it('emits a section entry for {start_of_bridge}', () => {
      const song = parseChordPro('', MULTI_SECTION_SONG);
      const sections = song.lines.filter((l) => 'section' in l);
      const bridge = sections.find((l) => l.section?.toLowerCase().includes('bridge'));
      expect(bridge).toBeDefined();
    });
  });

  describe('lyric lines', () => {
    it('preserves chord markers inline with lyric text in ChordPro format', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      const lyricLines = song.lines.filter((l) => 'text' in l).map((l) => l.text ?? '');
      const firstLine = lyricLines[0];
      expect(firstLine).toBeTruthy();
      expect(firstLine).toContain('[G]');
      expect(firstLine).toContain('[G7]');
      expect(firstLine).toContain('[C]');
      expect(firstLine).toContain('Amazing');
    });

    it('does not include empty text entries', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      const emptyLines = song.lines.filter((l) => 'text' in l && !l.text?.trim());
      expect(emptyLines).toHaveLength(0);
    });

    it('returns the expected number of lyric lines', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      const lyricLines = song.lines.filter((l) => 'text' in l);
      // 2 verse lines + 2 chorus lines = 4
      expect(lyricLines).toHaveLength(4);
    });
  });

  describe('empty input', () => {
    it('does not crash on empty string', () => {
      expect(() => parseChordPro('My Song', '')).not.toThrow();
    });

    it('returns an empty lines array for empty input', () => {
      const song = parseChordPro('My Song', '');
      expect(song.lines).toEqual([]);
    });

    it('uses the supplied name when input is empty', () => {
      const song = parseChordPro('My Song', '');
      expect(song.name).toBe('My Song');
    });

    it('defaults bpm to 120 and key to C for empty input', () => {
      const song = parseChordPro('', '');
      expect(song.bpm).toBe(120);
      expect(song.key).toBe('C');
    });
  });

  describe('round-trip shape', () => {
    it('returns a valid Song object with all expected keys', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      expect(song).toMatchObject({
        name: expect.any(String),
        bpm: expect.any(Number),
        key: expect.any(String),
        lines: expect.any(Array),
      });
    });

    it('every line has either a section or text property (not both empty)', () => {
      const song = parseChordPro('', MULTI_SECTION_SONG);
      for (const line of song.lines) {
        const hasSection = 'section' in line && typeof line.section === 'string';
        const hasText = 'text' in line && typeof line.text === 'string';
        expect(hasSection || hasText).toBe(true);
      }
    });

    it('section entries appear before the lyric lines of their section', () => {
      const song = parseChordPro('', SIMPLE_SONG);
      // First non-empty line should be a section marker
      expect(song.lines[0]).toHaveProperty('section');
    });
  });
});
