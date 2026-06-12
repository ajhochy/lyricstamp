// CONTRACT TEST — issue #27: ChordPro preview must render chords + directives.
// These tests MUST fail before implementation: client/src/chord-preview.ts
// does not exist yet on unmodified main.
//
// Design under contract: the chord-above-lyric rendering is extracted into a
// pure function `renderChordProHtml(text: string): string` in
// client/src/chord-preview.ts so it is unit-testable in the node vitest
// environment (no DOM). The React preview component calls it and injects the
// HTML. The server stamp path (server/src/chordpro.ts) is unchanged.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { renderChordProHtml } from '../../client/src/chord-preview.js';
import { parseChordPro } from '../../server/src/chordpro.js';

const SONG = `{title: Amazing Grace}
{start_of_chorus}
[G]Amazing [C]grace how sweet
{end_of_chorus}`;

describe('issue-27-c1: chord preview places chords above lyrics', () => {
  it('emits chord cells and lyric cells, with chord row before lyric row', () => {
    const html = renderChordProHtml(SONG);
    expect(html).toContain('class="chord"');
    expect(html).toContain('class="lyrics"');
    // In HtmlTableFormatter the chord <tr> precedes the lyric <tr> in each row
    // table, so the first chord cell appears before the first lyric cell.
    const firstChord = html.indexOf('class="chord"');
    const firstLyric = html.indexOf('class="lyrics"');
    expect(firstChord).toBeGreaterThanOrEqual(0);
    expect(firstLyric).toBeGreaterThan(firstChord);
    expect(html).toContain('>G<');
    expect(html).toContain('>C<');
  });
});

describe('issue-27-c2: directives render as headers / labels', () => {
  it('renders {title} and section directives as labelled elements', () => {
    const html = renderChordProHtml(SONG);
    // title directive -> header element carrying the title text
    expect(html).toMatch(/class="title"[^>]*>Amazing Grace</);
    // chorus directive -> paragraph labelled "chorus"
    expect(html).toContain('paragraph chorus');
  });

  it('renders {comment} directives as a comment label', () => {
    const html = renderChordProHtml('{comment: Bridge}\n[Am]words');
    expect(html).toMatch(/class="comment"[^>]*>Bridge</);
  });
});

describe('issue-27-c3: stamp path lyric text is unchanged', () => {
  it('server parseChordPro still concatenates chord brackets with lyrics for stamping', () => {
    const song = parseChordPro('Amazing Grace', SONG);
    const lyricLines = song.lines.filter((l) => l.text);
    expect(lyricLines[0]?.text).toContain('[G]');
    expect(lyricLines[0]?.text).toContain('[C]');
    expect(lyricLines[0]?.text).toContain('Amazing');
  });
});

describe('issue-27-c4: pure-lyric ChordPro renders without error', () => {
  it('renders lyric-only text with no chords and surfaces the lyrics', () => {
    const html = renderChordProHtml('Just lyrics here\nMore lyrics');
    expect(html).toContain('Just lyrics here');
    expect(html).toContain('More lyrics');
    expect(html).toContain('class="lyrics"');
  });
});
