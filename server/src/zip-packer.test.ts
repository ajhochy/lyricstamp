import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { packLeadsheetZip } from './zip-packer.js';
import type { ZipPackerInput } from './zip-packer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal 1x1 transparent PNG (67 bytes). */
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c6260000000000200e221bc330000000049454e44ae' +
    '426082',
  'hex',
);

const FAKE_ALS = Buffer.from('FAKE_ALS_CONTENT');

const PROJECT = 'Great Things - E - 4:4 - 68 BPM Project';
const ALS_NAME = 'Great Things - E.als';
const IMAGES_SUBDIR = 'Lyrics/great-things-lead-sheet';

/** Build a ZipPackerInput with sensible defaults, overridable per test. */
function makeInput(over: Partial<ZipPackerInput> = {}): ZipPackerInput {
  return {
    projectFolder: PROJECT,
    alsFilename: ALS_NAME,
    imagesSubdir: IMAGES_SUBDIR,
    pages: [],
    manifest: [],
    stampsAls: FAKE_ALS,
    ...over,
  };
}

async function unzipBuffer(buf: Buffer): Promise<Record<string, Uint8Array>> {
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return unzipSync(uint8);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('packLeadsheetZip', () => {
  describe('basic output', () => {
    it('resolves to a non-empty Buffer', async () => {
      const result = await packLeadsheetZip(makeInput());
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('AbleSet project layout', () => {
    it('nests the .als inside the project folder', async () => {
      const zip = await unzipBuffer(await packLeadsheetZip(makeInput()));
      expect(zip[`${PROJECT}/${ALS_NAME}`]).toBeDefined();
    });

    it('nests stamps.json inside the project folder', async () => {
      const zip = await unzipBuffer(await packLeadsheetZip(makeInput()));
      expect(zip[`${PROJECT}/stamps.json`]).toBeDefined();
    });

    it('places page images under <project>/Lyrics/<subfolder>/', async () => {
      const zip = await unzipBuffer(
        await packLeadsheetZip(
          makeInput({
            pages: [
              { filename: 'page-1.png', pngBuffer: TINY_PNG },
              { filename: 'page-2.png', pngBuffer: TINY_PNG },
            ],
          }),
        ),
      );
      expect(zip[`${PROJECT}/${IMAGES_SUBDIR}/page-1.png`]).toBeDefined();
      expect(zip[`${PROJECT}/${IMAGES_SUBDIR}/page-2.png`]).toBeDefined();
    });

    it('every entry lives under the single top-level project folder', async () => {
      const zip = await unzipBuffer(
        await packLeadsheetZip(makeInput({ pages: [{ filename: 'page-1.png', pngBuffer: TINY_PNG }] })),
      );
      for (const key of Object.keys(zip)) {
        expect(key.startsWith(`${PROJECT}/`)).toBe(true);
      }
    });
  });

  describe('content round-trips', () => {
    it('.als bytes round-trip exactly', async () => {
      const distinctAls = Buffer.from('ABCDEFGH_12345678');
      const zip = await unzipBuffer(await packLeadsheetZip(makeInput({ stampsAls: distinctAls })));
      expect(Buffer.from(zip[`${PROJECT}/${ALS_NAME}`]).equals(distinctAls)).toBe(true);
    });

    it('PNG bytes round-trip exactly', async () => {
      const distinctPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04]);
      const zip = await unzipBuffer(
        await packLeadsheetZip(makeInput({ pages: [{ filename: 'page-1.png', pngBuffer: distinctPng }] })),
      );
      expect(Buffer.from(zip[`${PROJECT}/${IMAGES_SUBDIR}/page-1.png`]).equals(distinctPng)).toBe(true);
    });

    it('stamps.json matches the input manifest', async () => {
      const manifest = [
        { ts: 0.0, page: 1, imageRef: 'great-things-lead-sheet/page-1.png', region: '' },
        { ts: 4.5, page: 2, imageRef: 'great-things-lead-sheet/page-2.png', region: '' },
      ];
      const zip = await unzipBuffer(await packLeadsheetZip(makeInput({ manifest })));
      const json = Buffer.from(zip[`${PROJECT}/stamps.json`]).toString('utf-8');
      expect(JSON.parse(json)).toEqual(manifest);
    });
  });

  describe('entry count', () => {
    it('contains pages + stamps.json + .als', async () => {
      const zip = await unzipBuffer(
        await packLeadsheetZip(
          makeInput({
            pages: [
              { filename: 'page-1.png', pngBuffer: TINY_PNG },
              { filename: 'page-2.png', pngBuffer: TINY_PNG },
            ],
          }),
        ),
      );
      // 2 pages + stamps.json + .als = 4
      expect(Object.keys(zip)).toHaveLength(4);
    });

    it('with no pages, contains just stamps.json + .als', async () => {
      const zip = await unzipBuffer(await packLeadsheetZip(makeInput()));
      expect(Object.keys(zip)).toHaveLength(2);
    });
  });
});
