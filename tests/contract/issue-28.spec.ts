// CONTRACT TEST — issue #28: stamp preview UX is a display/labelling change ONLY.
//
// c1/c2/c3 are UI criteria verified by Playwright (e2e/tests/verification.spec.ts).
// c4 — "No actual stamp logic changes" — is pinned here as a regression guard:
// the stamp-to-clip mapping (server stampsToClips) must produce the same beats,
// names, and lengths regardless of the preview labelling. This test passes on
// current main (the labelling already landed without touching stamp logic) and
// guards against the #28 work accidentally altering clip mapping.

import { describe, it, expect } from 'vitest';
import { stampsToClips } from '../../server/src/routes.js';

const SONG = {
  lines: [
    { text: 'Line one' },
    { text: 'Line two' },
    { text: 'Line three' },
  ],
};

describe('issue-28-c4: stamp-to-clip mapping unchanged by labelling work', () => {
  it('maps stamps to clips with next-beat lengths and explicit text passthrough', () => {
    const clips = stampsToClips(SONG, [
      { idx: 0, ts: 0, text: 'Line one' },
      { idx: 1, ts: 4, text: 'Line two' },
      { idx: 2, ts: 10, text: 'Line three' },
    ]);
    expect(clips).toEqual([
      { name: 'Line one', beat: 0, length: 4 },
      { name: 'Line two', beat: 4, length: 6 },
      // last clip falls back to DEFAULT_CLIP_LENGTH (4)
      { name: 'Line three', beat: 10, length: 4 },
    ]);
  });

  it('falls back to song line text when stamp text is absent', () => {
    const clips = stampsToClips(SONG, [{ idx: 1, ts: 2 }]);
    expect(clips[0].name).toBe('Line two');
    expect(clips[0].beat).toBe(2);
  });
});
