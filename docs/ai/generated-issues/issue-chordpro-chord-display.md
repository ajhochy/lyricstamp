# Fix: ChordPro preview strips chords and directives — only lyrics shown

## Problem

The ChordPro preview only shows lyric text. Chords like `[G]`, `[C/E]` and directives like `{title: Song}`, `{comment: Bridge}` are invisible.

## Root cause

`server/src/chordpro.ts` (`parseChordPro`) intentionally strips chords — it only reads `item.lyrics` from each `ChordLyricsPair` to build the stamp-ready `Song` type. This is correct for stamping, but the raw paste is also used as the preview, so users never see the chord notation they typed.

```ts
// current — strips chords
for (const item of line.items) {
  if (item instanceof ChordLyricsPair) {
    text += item.lyrics ?? '';   // chord dropped
  }
}
```

## Research findings (chordsheetjs v14)

- `ChordProParser.parse(text)` returns a `Song` with `.paragraphs[]` → `.lines[]` → `.items[]`
- Each `ChordLyricsPair` has `.chords` (string, e.g. `"G"`) and `.lyrics` (string)
- `Tag` items represent directives; `.name` = directive name, `.value` = directive value
- Built-in formatters: `HtmlTableFormatter` (chords above lyrics in `<table>`), `TextFormatter`, `HtmlDivFormatter`
- `HtmlTableFormatter` is the canonical way to render chord-above-lyric display

## Acceptance criteria

- [ ] Preview tab renders chords above lyrics in the correct ChordPro style
- [ ] Directives (`{title}`, `{comment}`, `{start_of_chorus}`, etc.) render as section headers / labels
- [ ] Stamping still uses lyric-only text (stamp log and `.als` clip names unchanged)
- [ ] ChordPro text with no chords still renders correctly (pure lyric sheet)

## Likely files

- `client/src/views.tsx` — add a ChordPro chord display component
- `client/src/app.tsx` — pass `pasteText` (raw ChordPro) to the preview component
- `server/src/chordpro.ts` — no change needed (stamp path is correct)

## Suggested approach

On the client, import `chordsheetjs` and use `HtmlTableFormatter` to render `pasteText` directly into an HTML string displayed via `dangerouslySetInnerHTML` (or a sanitised equivalent). The chord preview is purely client-side — no server round-trip needed.

```ts
import ChordSheetJS from 'chordsheetjs';
const song = new ChordSheetJS.ChordProParser().parse(pasteText);
const html = new ChordSheetJS.HtmlTableFormatter().format(song);
// render <div dangerouslySetInnerHTML={{ __html: html }} />
```

Add CSS for `.chord-sheet table`, `.chord` (bold), `.lyrics`, `.comment` classes that HtmlTableFormatter emits.

Postmortem: `.agent-stack/postmortems/2026-06-02-issue-1.json` criterion issue-1-c3
