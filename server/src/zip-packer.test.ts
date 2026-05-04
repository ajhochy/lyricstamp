import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { packLeadsheetZip } from './zip-packer.js';
import type { ZipPackerInput } from './zip-packer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal 1x1 transparent PNG (67 bytes).
 * Pre-computed from a known-good 1x1 PNG to avoid any runtime image generation.
 */
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c6260000000000200e221bc330000000049454e44ae' +
    '426082',
  'hex',
);

/** A fake .als buffer (just a short placeholder). */
const FAKE_ALS = Buffer.from('FAKE_ALS_CONTENT');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Unzip a Buffer returned by packLeadsheetZip into a map of path → Uint8Array.
 */
async function unzipBuffer(buf: Buffer): Promise<Record<string, Uint8Array>> {
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return unzipSync(uint8);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('packLeadsheetZip', () => {
  describe('basic output', () => {
    it('resolves to a Buffer', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const result = await packLeadsheetZip(input);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('returns a non-empty buffer', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const result = await packLeadsheetZip(input);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('required entries', () => {
    it('always includes stamps.json', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      expect(zip['stamps.json']).toBeDefined();
    });

    it('always includes Stamps.als at root', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      expect(zip['Stamps.als']).toBeDefined();
    });
  });

  describe('Stamps.als content', () => {
    it('Stamps.als bytes match the provided stampsAls buffer', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const alsBytes = Buffer.from(zip['Stamps.als']);
      expect(alsBytes.equals(FAKE_ALS)).toBe(true);
    });

    it('Stamps.als with non-trivial content round-trips exactly', async () => {
      const distinctAls = Buffer.from('ABCDEFGH_12345678');
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: distinctAls,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const alsBytes = Buffer.from(zip['Stamps.als']);
      expect(alsBytes.equals(distinctAls)).toBe(true);
    });
  });

  describe('stamps.json', () => {
    it('stamps.json is valid JSON', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [{ ts: 1.5, page: 1, imageRef: 'page1.png', region: '0,0,100,100' }],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const json = Buffer.from(zip['stamps.json']).toString('utf-8');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('stamps.json matches the input manifest', async () => {
      const manifest = [
        { ts: 0.0, page: 1, imageRef: 'page1.png', region: '0,0,100,200' },
        { ts: 4.5, page: 2, imageRef: 'page2.png', region: '50,50,200,300' },
      ];
      const input: ZipPackerInput = {
        pages: [],
        manifest,
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const json = Buffer.from(zip['stamps.json']).toString('utf-8');
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(manifest);
    });

    it('stamps.json is empty array for empty manifest', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const json = Buffer.from(zip['stamps.json']).toString('utf-8');
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  describe('page images', () => {
    it('includes Lyrics/<filename> for each page', async () => {
      const input: ZipPackerInput = {
        pages: [
          { filename: 'page2.png', pngBuffer: TINY_PNG },
          { filename: 'page5.png', pngBuffer: TINY_PNG },
        ],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      expect(zip['Lyrics/page2.png']).toBeDefined();
      expect(zip['Lyrics/page5.png']).toBeDefined();
    });

    it('PNG bytes round-trip exactly', async () => {
      const distinctPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04]);
      const input: ZipPackerInput = {
        pages: [{ filename: 'test.png', pngBuffer: distinctPng }],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const roundTripped = Buffer.from(zip['Lyrics/test.png']);
      expect(roundTripped.equals(distinctPng)).toBe(true);
    });

    it('does not create any Lyrics/ entries when pages is empty', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const lyricsEntries = Object.keys(zip).filter((k) => k.startsWith('Lyrics/'));
      expect(lyricsEntries).toHaveLength(0);
    });

    it('handles a single page correctly', async () => {
      const input: ZipPackerInput = {
        pages: [{ filename: 'slide1.png', pngBuffer: TINY_PNG }],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      expect(zip['Lyrics/slide1.png']).toBeDefined();
      const roundTripped = Buffer.from(zip['Lyrics/slide1.png']);
      expect(roundTripped.equals(TINY_PNG)).toBe(true);
    });
  });

  describe('empty pages — minimum valid zip', () => {
    it('empty pages still produces a zip with stamps.json and Stamps.als', async () => {
      const input: ZipPackerInput = {
        pages: [],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      const keys = Object.keys(zip);
      expect(keys).toContain('stamps.json');
      expect(keys).toContain('Stamps.als');
      expect(keys).toHaveLength(2);
    });
  });

  describe('zip entry count', () => {
    it('zip contains exactly pages + stamps.json + Stamps.als entries', async () => {
      const input: ZipPackerInput = {
        pages: [
          { filename: 'a.png', pngBuffer: TINY_PNG },
          { filename: 'b.png', pngBuffer: TINY_PNG },
        ],
        manifest: [],
        stampsAls: FAKE_ALS,
      };
      const zip = await unzipBuffer(await packLeadsheetZip(input));
      // 2 pages + stamps.json + Stamps.als = 4
      expect(Object.keys(zip)).toHaveLength(4);
    });
  });
});
