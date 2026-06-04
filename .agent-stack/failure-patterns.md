# Failure Patterns

## 2026-06-02 — Issues 26/27/28 — All criteria pass after iterative Live 12 .als fix

- **Result**: smoke PASS (verification claimed PASS)
- **Category**: none (all correct on final round; intermediate failures were in-process C3 corrections)
- **Criteria affected**: .als Live 12 export (3 rounds: wrong version string, empty XML attributes, regex mangled tag names — fixed by swapping to native Live 12 template)
- **Root cause**: Guessed MinorVersion format (`12.0.12049` dot-format vs `12.0_12402` underscore-format) wrong; regex sanitization matched XML tag names
- **Suggested fix**: Always use user's native Live .als as template instead of patching version strings. For .als work, the template IS the source of truth.

## 2026-06-02 — Issue 1 (Electron wrapper) — 3 smoke failures, all C1 (missing contract)

- **Result**: smoke FAIL (verification claimed PASS via typecheck/lint/build only)
- **Category**: C1 — Missing contract (acceptance-contract was never run)
- **Criteria affected**: .als export opens in Live, ChordPro chord display, stamp preview UX
- **Root cause**: acceptance-contract was skipped before coding-agent; all acceptance criteria were implicit, untested, and discovered only at manual smoke
- **Suggested fix**: Enforce acceptance-contract dispatch before every coding-agent; add an Ableton Live file-open smoke step and a ChordPro render check to the contract for any issue touching .als export or lyrics display
