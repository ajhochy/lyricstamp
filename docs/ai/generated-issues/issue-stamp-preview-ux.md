# Fix: Stamp preview UX — "current" line label is ambiguous, causes off-by-one confusion

## Problem

The preview shows the line at `cursor` labelled "current" (CSS class `lyric-current entering`) and the next line below it. The user reported stamping the wrong line because they interpreted the highlighted line as "what is currently playing" (already past) rather than "what you are about to stamp."

**User's words:** "Preview shows one line ahead of what is actually stamped on the stamp log. So when I think I'm stamping the 'next line' I'm actually stamping the 'current' line. Is that right?"

## Root cause (code trace)

```
app.tsx:
  cursor            → the line index that WILL be stamped on next press
  currentLineObj    → song.lines[cursor]          → what gets stamped
  nextTextIdx       → findNextTextLine(cursor, 1) → what comes after

views.tsx:
  <div className="lyric-current entering">{currentLine}</div>  ← stamped on press
  <div className="lyric-next">{nextLine}</div>                 ← after press
```

The CSS class `entering` and the word "current" suggest the line is currently happening — but it is actually the *upcoming* line (not yet started). Users familiar with teleprompter convention expect the big highlighted line to be "next up," which matches the code intent. Users who think of "current" as "now playing" expect it to be one line behind.

## Acceptance criteria

- [ ] The UI clearly communicates which line will be timestamped when the stamp button is pressed
- [ ] After stamping, the newly-promoted line is clearly the "next to stamp"
- [ ] The distinction between "just stamped" and "about to stamp" is visually unambiguous
- [ ] No actual stamp logic changes (only display/labelling)

## Likely files

- `client/src/views.tsx` — relabel or restructure the preview section
- Possibly `client/src/app.css` or equivalent styles

## Suggested approach

Option A — **Add an explicit label** above the big line: e.g., "STAMP NEXT →" or "⏱ Next stamp target:" so users know this is what they're marking.

Option B — **Show the last-stamped line above**: render the most-recently-stamped line (faded/struck-through) above the current line, so the flow reads: [just stamped] → **[stamp this]** → [coming up]. This matches a teleprompter mental model.

Option C — **Rename CSS class** from `lyric-current entering` to something that doesn't imply "now playing," and add a small annotation "(press S to stamp this line)".

Postmortem: `.agent-stack/postmortems/2026-06-02-issue-1.json` criterion issue-1-c4
