// Client-side ChordPro preview renderer (issue #27).
//
// The stamp path (server/src/chordpro.ts) intentionally strips chords down to a
// chord-bracketed lyric string for .als clip names. That is correct for
// stamping but means the user never sees the chord-above-lyric layout they
// typed. This module renders the RAW ChordPro paste into chord-above-lyric HTML
// for the preview tab only — it does not touch the stamp/export path.
//
// chordsheetjs ships a CJS bundle as its Node.js entry point; named ESM imports
// are not reliably available via module resolution. Import the default and
// destructure from it (same pattern as server/src/chordpro.ts).
import chordsheetjs from 'chordsheetjs';

const { ChordProParser, HtmlTableFormatter } = chordsheetjs as typeof import('chordsheetjs');

/**
 * Render raw ChordPro text into chord-above-lyric HTML.
 *
 * Uses chordsheetjs `HtmlTableFormatter`, which emits, per row:
 *   <table class="row">
 *     <tr><td class="chord">G</td>...</tr>   ← chords (above)
 *     <tr><td class="lyrics">Amazing </td>...</tr> ← lyrics (below)
 *   </table>
 * Directives become labelled elements: `{title}` → `<h1 class="title">`,
 * sections → `<div class="paragraph <type>">`, `{comment}` → `<td class="comment">`.
 *
 * Pure-lyric input (no chords) renders lyric cells only — no error.
 * Empty/whitespace input renders an empty chord-sheet container.
 *
 * The output is consumed via `dangerouslySetInnerHTML`. HtmlTableFormatter
 * HTML-escapes chord and lyric text, so user paste is not injected as raw HTML.
 */
export function renderChordProHtml(text: string): string {
  if (!text || text.trim() === '') {
    return '<div class="chord-sheet"></div>';
  }
  try {
    const song = new ChordProParser().parse(text);
    return new HtmlTableFormatter().format(song);
  } catch {
    // Malformed ChordPro should never crash the preview — fall back to plain,
    // HTML-escaped text so the user still sees what they typed.
    return `<div class="chord-sheet"><pre>${escapeHtml(text)}</pre></div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
