/**
 * zip-packer.ts
 *
 * Pure module that assembles the Leadsheet export zip in memory.
 *
 * The zip contains:
 *   Lyrics/<filename>   – one entry per unique page PNG
 *   stamps.json         – manifest: array of { ts, page, imageRef, region }
 *   Stamps.als          – pre-built Ableton Live file from als-writer
 */

import archiver from 'archiver';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ZipPackerInput = {
  /** Unique pages only — each filename maps to the decoded PNG bytes. */
  pages: Array<{ filename: string; pngBuffer: Buffer }>;
  /** Stamp manifest (pngDataUrl already stripped by the caller). */
  manifest: Array<{ ts: number; page: number; imageRef: string; region: string }>;
  /** Pre-built Stamps.als buffer from als-writer. */
  stampsAls: Buffer;
};

/**
 * Build an in-memory zip buffer containing:
 * - `Lyrics/<filename>` for each page in `input.pages`
 * - `stamps.json` serialised from `input.manifest`
 * - `Stamps.als` at the zip root
 *
 * @returns A Promise that resolves to the complete zip as a Buffer.
 */
export function packLeadsheetZip(input: ZipPackerInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('finish', () => resolve(Buffer.concat(chunks)));

    // Add each unique page PNG under Lyrics/
    for (const page of input.pages) {
      archive.append(page.pngBuffer, { name: `Lyrics/${page.filename}` });
    }

    // Add the stamp manifest (pretty-printed JSON)
    archive.append(JSON.stringify(input.manifest, null, 2), { name: 'stamps.json' });

    // Add the pre-built Ableton Live file at the zip root
    archive.append(input.stampsAls, { name: 'Stamps.als' });

    archive.finalize().catch(reject);
  });
}
