import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { writeAlsFile } from './als-writer.js';
import type { AlsStampInput } from './als-writer.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function gunzipToString(buf: Buffer): string {
  return gunzipSync(buf).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeAlsFile', () => {
  describe('basic structure', () => {
    it('returns a Buffer', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Vocals +LYRICS', stamps: [] });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('returns a valid gzip-compressed buffer', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Vocals +LYRICS', stamps: [] });
      // gzip magic bytes: 0x1f 0x8b
      expect(result[0]).toBe(0x1f);
      expect(result[1]).toBe(0x8b);
    });

    it('gunzips to XML (starts with <?xml)', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml.trimStart()).toMatch(/^<\?xml/);
    });
  });

  describe('track name', () => {
    it('renames the track EffectiveName in the output', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Lead Sheet', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml).toContain('<EffectiveName Value="Lead Sheet" />');
    });

    it('template default track name is replaced', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'My Lyrics', stamps: [] });
      const xml = gunzipToString(result);
      const firstMatch = xml.match(/<EffectiveName Value="([^"]+)" \/>/)?.[1];
      expect(firstMatch).toBe('My Lyrics');
    });

    it('XML-escapes & in track name', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Lead & Lyrics', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml).toContain('Lead &amp; Lyrics');
    });

    it('XML-escapes < in track name', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'A<B', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml).toContain('A&lt;B');
    });

    it('Leadsheet +LYRICS track name variant appears correctly', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Leadsheet +LYRICS', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml).toContain('<EffectiveName Value="Leadsheet +LYRICS" />');
    });
  });

  describe('empty stamps', () => {
    it('produces valid XML even with zero stamps', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps: [] });
      const xml = gunzipToString(result);
      // Should still have the Events element (possibly empty or with no MidiClip)
      expect(xml).toContain('<Events>');
    });

    it('contains no MidiClip elements when stamps array is empty', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps: [] });
      const xml = gunzipToString(result);
      expect(xml).not.toContain('<MidiClip');
    });
  });

  describe('beat math', () => {
    // ts values are in BEATS — AbletonOSC /live/song/get/current_song_time returns beats.
    // No seconds→beats conversion: ts is used directly as the clip position in beats.

    it('ts=1.5 (beats) → clip at beat 1.5 (no bpm conversion applied)', () => {
      // Previously this test assumed ts=1.5 was seconds and expected 1.5*(120/60)=3.
      // Correct: ts is already in beats, clip lands at beat 1.5.
      const stamps: AlsStampInput[] = [{ ts: 1.5, clipName: 'Verse 1' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('Time="1.5"');
    });

    it('ts=10.0 (beats) → clip at beat 10.0 regardless of bpm', () => {
      // Previously assumed seconds and expected 10*(76/60)≈12.667. Correct: beat 10.
      const stamps: AlsStampInput[] = [{ ts: 10.0, clipName: 'Chorus 1' }];
      const result = writeAlsFile({ bpm: 76, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('Time="10"');
    });

    it('ts=0.0 → clip at beat 0', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'Intro' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('Time="0"');
    });

    it('multiple stamps produce multiple MidiClip elements at correct beat positions', () => {
      // ts values are musical beat positions: 0, 4, 8 = bar 1, bar 2, bar 3 in 4/4
      const stamps: AlsStampInput[] = [
        { ts: 0.0, clipName: 'Verse 1' },
        { ts: 4.0, clipName: 'Chorus 1' },
        { ts: 8.0, clipName: 'Bridge' },
      ];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      const clipMatches = xml.match(/<MidiClip /g);
      expect(clipMatches).toHaveLength(3);
      expect(xml).toContain('Time="0"');
      expect(xml).toContain('Time="4"');
      expect(xml).toContain('Time="8"');
    });
  });

  describe('clip names', () => {
    it('preserves plain clip names in output', () => {
      const stamps: AlsStampInput[] = [{ ts: 1.0, clipName: 'Verse 1' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="Verse 1" />');
    });

    it('XML-escapes & in clip names', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'Verse & Chorus' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="Verse &amp; Chorus" />');
    });

    it('XML-escapes < in clip names', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'A<B' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="A&lt;B" />');
    });

    it('preserves colons in clip names', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'Verse: Opening' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="Verse: Opening" />');
    });

    it('preserves brackets in clip names', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: '[Chorus] Part 1' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="[Chorus] Part 1" />');
    });

    it('preserves unicode in clip names', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'Verse – Refrain' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<Name Value="Verse – Refrain" />');
    });
  });

  describe('clip IDs and sequence', () => {
    it('assigns sequential IDs starting from 0', () => {
      const stamps: AlsStampInput[] = [
        { ts: 0.0, clipName: 'A' },
        { ts: 1.0, clipName: 'B' },
      ];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('<MidiClip Id="0"');
      expect(xml).toContain('<MidiClip Id="1"');
    });
  });

  describe('multi-track (tracks[] mode)', () => {
    // Helper: return the substring for a given MidiTrack block (track 0 or 1).
    function trackBlock(xml: string, index: 0 | 1): string {
      const starts = [...xml.matchAll(/<MidiTrack Id="\d+"/g)].map((m) => m.index ?? -1);
      const from = starts[index];
      const to = index + 1 < starts.length ? starts[index + 1] : xml.length;
      return xml.slice(from, to);
    }

    it('populates lyrics on the chart track and images on the leadsheet track', () => {
      const result = writeAlsFile({
        tracks: [
          { track: 'chart', name: 'Vocals +LYRICS', stamps: [{ ts: 2, clipName: 'Amazing grace' }] },
          { track: 'leadsheet', name: 'leadsheet +LYRICS [-2n]', stamps: [{ ts: 5, clipName: '[img:page1.png]' }] },
        ],
      });
      const xml = gunzipToString(result);

      const chart = trackBlock(xml, 0);
      const leadsheet = trackBlock(xml, 1);

      // Lyric clip is in the chart track, NOT the leadsheet track.
      expect(chart).toContain('<Name Value="Amazing grace" />');
      expect(chart).not.toContain('[img:page1.png]');
      // Image clip is in the leadsheet track, NOT the chart track.
      expect(leadsheet).toContain('<Name Value="[img:page1.png]" />');
      expect(leadsheet).not.toContain('Amazing grace');
    });

    it('renames each track to its spec name', () => {
      const result = writeAlsFile({
        tracks: [
          { track: 'chart', name: 'Vocals +LYRICS', stamps: [] },
          { track: 'leadsheet', name: 'Sheet Pages', stamps: [] },
        ],
      });
      const xml = gunzipToString(result);
      expect(trackBlock(xml, 0)).toContain('<EffectiveName Value="Vocals +LYRICS" />');
      expect(trackBlock(xml, 1)).toContain('<EffectiveName Value="Sheet Pages" />');
    });

    it('assigns globally-unique clip IDs across both tracks', () => {
      const result = writeAlsFile({
        tracks: [
          { track: 'chart', name: 'L', stamps: [{ ts: 0, clipName: 'a' }, { ts: 1, clipName: 'b' }] },
          { track: 'leadsheet', name: 'S', stamps: [{ ts: 0, clipName: 'c' }] },
        ],
      });
      const xml = gunzipToString(result);
      const ids = [...xml.matchAll(/<MidiClip Id="(\d+)"/g)].map((m) => m[1]);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3); // all unique
    });

    it('leaves the leadsheet track empty when only chart stamps are given', () => {
      const result = writeAlsFile({
        tracks: [{ track: 'chart', name: 'Vocals +LYRICS', stamps: [{ ts: 0, clipName: 'x' }] }],
      });
      const xml = gunzipToString(result);
      expect(trackBlock(xml, 1)).not.toContain('<MidiClip ');
    });
  });
});
