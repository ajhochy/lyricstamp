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
      expect(xml).toContain('<EffectiveName Value="Lead Sheet">');
    });

    it('template default track name is replaced', () => {
      const result = writeAlsFile({ bpm: 120, trackName: 'My Lyrics', stamps: [] });
      const xml = gunzipToString(result);
      // Original template name should no longer be the first EffectiveName
      const firstMatch = xml.match(/<EffectiveName Value="([^"]+)">/)?.[1];
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
      expect(xml).toContain('<EffectiveName Value="Leadsheet +LYRICS">');
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
    it('bpm=120, ts=1.5 → clip at beat 3', () => {
      // beats = 1.5 * (120 / 60) = 1.5 * 2 = 3.0
      const stamps: AlsStampInput[] = [{ ts: 1.5, clipName: 'Verse 1' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('Time="3"');
    });

    it('bpm=76, ts=10.0 → clip at beat ~12.6667', () => {
      // beats = 10.0 * (76 / 60) = 12.666...
      const beats = 10.0 * (76 / 60);
      const expectedBeatStr = parseFloat(beats.toFixed(6)).toString();
      const stamps: AlsStampInput[] = [{ ts: 10.0, clipName: 'Chorus 1' }];
      const result = writeAlsFile({ bpm: 76, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain(`Time="${expectedBeatStr}"`);
    });

    it('ts=0.0 → clip at beat 0', () => {
      const stamps: AlsStampInput[] = [{ ts: 0.0, clipName: 'Intro' }];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      expect(xml).toContain('Time="0"');
    });

    it('multiple stamps produce multiple MidiClip elements', () => {
      const stamps: AlsStampInput[] = [
        { ts: 0.0, clipName: 'Verse 1' },
        { ts: 4.0, clipName: 'Chorus 1' },
        { ts: 8.0, clipName: 'Bridge' },
      ];
      const result = writeAlsFile({ bpm: 120, trackName: 'Test', stamps });
      const xml = gunzipToString(result);
      const clipMatches = xml.match(/<MidiClip /g);
      expect(clipMatches).toHaveLength(3);
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
});
