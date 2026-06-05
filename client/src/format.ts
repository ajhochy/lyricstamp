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

/**
 * Format a beat position (AbletonOSC current_song_time, in QUARTER-NOTE beats)
 * as Ableton's "Bar.Beat.Sixteenth" arrangement position, 1-indexed, honoring
 * the time signature.
 *
 * Live measures position in quarter-note beats regardless of meter, so one
 * notated beat = 4/denominator quarters and a bar = numerator × (4/denominator)
 * quarters. 4/4: bar = 4 quarters; 6/8: bar = 3 quarters (6 eighth-note beats).
 *
 * e.g. 4/4 beats=5.5 → "2.2.3";  6/8 beats=0.5 → "1.2.1";  6/8 beats=3 → "2.1.1".
 */
export function fmtBeats(beats: number, numerator = 4, denominator = 4): string {
  const num = numerator > 0 ? numerator : 4;
  const den = denominator > 0 ? denominator : 4;
  const q = Math.max(0, beats);

  const beatLenQ = 4 / den; // length of one notated beat, in quarter notes
  const quartersPerBar = num * beatLenQ;

  const bar = Math.floor(q / quartersPerBar) + 1;
  const posInBarQ = q - Math.floor(q / quartersPerBar) * quartersPerBar;
  const beatInBar = Math.floor(posInBarQ / beatLenQ) + 1;
  const posInBeatQ = posInBarQ - Math.floor(posInBarQ / beatLenQ) * beatLenQ;
  const sixteenth = Math.floor(posInBeatQ / 0.25) + 1;

  return `${bar}.${beatInBar}.${sixteenth}`;
}
