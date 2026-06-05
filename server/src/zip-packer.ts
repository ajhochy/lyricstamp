/**
 * zip-packer.ts
 *
 * Pure module that assembles the Leadsheet export zip in memory, matching the
 * directory layout AbleSet's own Lyrics tool produces:
 *
 *   <projectFolder>/
 *     <alsFilename>                      – the Ableton Set
 *     stamps.json                        – our manifest (ignored by Ableset)
 *     <imagesSubdir>/page-1.png …        – page images (imagesSubdir is under Lyrics/)
 *
 * AbleSet resolves [img:<path>] clip names relative to the "Lyrics" folder that
 * sits next to the .als, so images live at <projectFolder>/Lyrics/<sub>/page-N.png
 * and the clips reference them as [img:<sub>/page-N.png].
 */

import archiver from 'archiver';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ZipPackerInput = {
  /** Top-level Ableton project folder name, e.g. "Song - 4:4 - 68 BPM Project". */
  projectFolder: string;
  /** The .als filename inside the project folder, e.g. "Song.als". */
  alsFilename: string;
  /** Directory (under the project folder) holding page images, e.g. "Lyrics/song-leadsheet". */
  imagesSubdir: string;
  /** Unique pages only — each filename maps to the decoded PNG bytes. */
  pages: Array<{ filename: string; pngBuffer: Buffer }>;
  /** Stamp manifest (pngDataUrl already stripped by the caller). */
  manifest: Array<{ ts: number; page: number; imageRef: string; region: string }>;
  /** Pre-built .als buffer from als-writer. */
  stampsAls: Buffer;
};

/**
 * Build an in-memory zip whose single top-level entry is the Ableton project
 * folder, containing the .als, the page images under `imagesSubdir`, and a
 * `stamps.json` manifest.
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

    const root = input.projectFolder;

    // Page images under <projectFolder>/<imagesSubdir>/
    for (const page of input.pages) {
      archive.append(page.pngBuffer, { name: `${root}/${input.imagesSubdir}/${page.filename}` });
    }

    // Manifest + the Ableton Set inside the project folder
    archive.append(JSON.stringify(input.manifest, null, 2), { name: `${root}/stamps.json` });
    archive.append(input.stampsAls, { name: `${root}/${input.alsFilename}` });

    archive.finalize().catch(reject);
  });
}
