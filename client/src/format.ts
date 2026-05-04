// format.ts — shared time-formatting helpers
// Extracted from design/app.jsx lines 5-12.

/** Format seconds → "M:SS.D" with monospaced-friendly layout. */
export function fmt(t: number): string {
  const sign = t < 0 ? '-' : '';
  const abs = Math.abs(t);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const d = Math.floor((abs * 10) % 10);
  return `${sign}${m}:${s.toString().padStart(2, '0')}.${d}`;
}
