import type http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { parseChordPro } from './chordpro.js';
import { writeAlsFile, DEFAULT_CLIP_LENGTH, type AlsTrackSpec } from './als-writer.js';
import { packLeadsheetZip } from './zip-packer.js';
import type { Song, LyricStamp, SheetStamp } from '../../shared/types.js';
import {
  listSessions,
  saveSession,
  getSession,
  getSessionPdf,
  deleteSession,
} from './session-store.js';
import type { OscClient } from './osc-client.js';

// ---------------------------------------------------------------------------
// OscClient injection (set once on startup; used by live-write routes)
// ---------------------------------------------------------------------------

let _oscClient: OscClient | null = null;

export function setOscClient(client: OscClient): void {
  _oscClient = client;
}

// Resolved lazily at request time so that ELECTRON_STATIC_DIR set by
// electron/main.ts (after app is ready) is visible. Fallback to out/renderer
// relative to cwd for standalone tsx usage.
function getStaticDir(): string {
  return process.env.ELECTRON_STATIC_DIR ?? resolve(process.cwd(), 'out/renderer');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB — generous for future PDF data-URL payloads

/** Read the full request body as a UTF-8 string, rejecting oversized requests. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Send a JSON response. */
function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const staticDir = getStaticDir();
  const url = req.url ?? '/';
  const path = url === '/' || url === '/index.html'
    ? resolve(staticDir, 'index.html')
    : resolve(staticDir, url.split('?')[0].replace(/^\/+/, ''));

  if (!existsSync(path) || !path.startsWith(staticDir)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(path).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const content = readFileSync(path);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': content.byteLength,
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(content);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): void {
  json(res, 200, { ok: true });
}

async function handlePostSong(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
    return;
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'Body must be a JSON object' });
    return;
  }

  const { name, chordpro } = body as Record<string, unknown>;

  if (typeof chordpro !== 'string') {
    json(res, 400, { error: 'Missing required field: chordpro (string)' });
    return;
  }

  const songName = typeof name === 'string' ? name : '';

  try {
    const song = parseChordPro(songName, chordpro);
    json(res, 200, song);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 400, { error: `ChordPro parse error: ${message}` });
  }
}

const MAX_STAMPS = 1000;

/** Sanitize a song name for use as a download filename. */
function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
}

/**
 * Slugify a leadsheet/song name for the Lyrics subfolder, matching AbleSet's
 * convention (lowercase, spaces and punctuation → single hyphens).
 * e.g. "A Thousand Hallelujahs F Lead Sheet" → "a-thousand-hallelujahs-f-lead-sheet"
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'leadsheet';
}

/**
 * Make a name safe to use as a folder/file name inside the zip while preserving
 * AbleSet's human-readable convention (keeps spaces, dashes, colons; strips only
 * path separators and other illegal characters).
 */
function safeFolderName(name: string): string {
  const cleaned = name.replace(/[/\\*?"<>|]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'Untitled';
}

async function handlePostExportAls(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'Body must be a JSON object' });
    return;
  }

  const { song, stamps } = body as Record<string, unknown>;

  if (song === undefined || song === null) {
    json(res, 400, { error: 'Missing required field: song' });
    return;
  }

  if (!Array.isArray(stamps)) {
    json(res, 400, { error: 'Missing required field: stamps (array)' });
    return;
  }

  if (stamps.length > MAX_STAMPS) {
    json(res, 400, { error: `stamps array exceeds maximum length of ${MAX_STAMPS}` });
    return;
  }

  // Validate song shape
  if (
    typeof song !== 'object' ||
    typeof (song as Record<string, unknown>).bpm !== 'number' ||
    typeof (song as Record<string, unknown>).name !== 'string'
  ) {
    json(res, 400, { error: 'Invalid song object: must have name (string) and bpm (number)' });
    return;
  }

  const songObj = song as Song;

  // Validate each stamp has required fields
  for (let i = 0; i < stamps.length; i++) {
    const stamp = stamps[i] as Record<string, unknown>;
    if (
      typeof stamp.lineIdx !== 'number' ||
      typeof stamp.lineText !== 'string' ||
      typeof stamp.ts !== 'number'
    ) {
      json(res, 400, { error: `stamps[${i}] missing required fields: lineIdx (number), lineText (string), ts (number)` });
      return;
    }
  }

  const stampInputs = (stamps as LyricStamp[]).map((stamp) => ({
    ts: stamp.ts,
    clipName: stamp.lineText,
  }));

  let alsBuffer: Buffer;
  try {
    alsBuffer = writeAlsFile({
      bpm: songObj.bpm,
      trackName: 'Vocals +LYRICS',
      stamps: stampInputs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 400, { error: `Failed to generate .als file: ${message}` });
    return;
  }

  const filename = `${sanitizeFilename(songObj.name)}.als`;

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': alsBuffer.byteLength,
  });
  res.end(alsBuffer);
}

/** Decode a PNG data URL into a Buffer. Returns null if not a valid PNG data URL. */
function decodePngDataUrl(dataUrl: string): Buffer | null {
  const PREFIX = 'data:image/png;base64,';
  if (!dataUrl.startsWith(PREFIX)) return null;
  const base64 = dataUrl.slice(PREFIX.length);
  // Validate base64 string is non-empty
  if (base64.length === 0) return null;
  return Buffer.from(base64, 'base64');
}

async function handlePostExportZip(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'Body must be a JSON object' });
    return;
  }

  const { song, stamps, lyricStamps, leadsheetName, timeSig } = body as Record<string, unknown>;

  if (song === undefined || song === null) {
    json(res, 400, { error: 'Missing required field: song' });
    return;
  }

  if (!Array.isArray(stamps)) {
    json(res, 400, { error: 'Missing required field: stamps (array)' });
    return;
  }

  if (stamps.length > MAX_STAMPS) {
    json(res, 400, { error: `stamps array exceeds maximum length of ${MAX_STAMPS}` });
    return;
  }

  // lyricStamps is optional: when present, the bundled .als also gets a
  // populated lyrics ("chart") track alongside the leadsheet image track.
  if (lyricStamps !== undefined && !Array.isArray(lyricStamps)) {
    json(res, 400, { error: 'lyricStamps, if provided, must be an array' });
    return;
  }
  if (Array.isArray(lyricStamps) && lyricStamps.length > MAX_STAMPS) {
    json(res, 400, { error: `lyricStamps array exceeds maximum length of ${MAX_STAMPS}` });
    return;
  }

  // Validate song shape
  if (
    typeof song !== 'object' ||
    typeof (song as Record<string, unknown>).bpm !== 'number' ||
    typeof (song as Record<string, unknown>).name !== 'string'
  ) {
    json(res, 400, { error: 'Invalid song object: must have name (string) and bpm (number)' });
    return;
  }

  const songObj = song as Song;

  // Validate each stamp has required SheetStamp fields
  for (let i = 0; i < stamps.length; i++) {
    const stamp = stamps[i] as Record<string, unknown>;
    if (
      typeof stamp.id !== 'string' ||
      typeof stamp.page !== 'number' ||
      typeof stamp.region !== 'string' ||
      typeof stamp.imageRef !== 'string' ||
      typeof stamp.pngDataUrl !== 'string' ||
      typeof stamp.ts !== 'number'
    ) {
      json(res, 400, {
        error: `stamps[${i}] missing required fields: id (string), page (number), region (string), imageRef (string), pngDataUrl (string), ts (number)`,
      });
      return;
    }
  }

  const sheetStamps = stamps as SheetStamp[];

  // AbleSet layout: <Song … Project>/Lyrics/<leadsheet-slug>/page-N.png, and
  // clips reference images relative to the Lyrics folder, i.e. [img:<slug>/page-N.png].
  const subfolder = slugify(
    typeof leadsheetName === 'string' && leadsheetName.trim() ? leadsheetName : songObj.name,
  );
  const imageRefFor = (page: number) => `${subfolder}/page-${page}.png`;

  // Dedupe pages by page number — pick the first stamp encountered per page
  const pageMap = new Map<number, { filename: string; pngBuffer: Buffer }>();
  for (const stamp of sheetStamps) {
    if (!pageMap.has(stamp.page)) {
      const pngBuffer = decodePngDataUrl(stamp.pngDataUrl);
      if (pngBuffer === null) {
        json(res, 400, { error: `stamps entry for page ${stamp.page} has invalid pngDataUrl: must be a data:image/png;base64,... URL` });
        return;
      }
      pageMap.set(stamp.page, { filename: `page-${stamp.page}.png`, pngBuffer });
    }
  }
  const pages = Array.from(pageMap.values());

  // Build manifest — all stamps in original order, pngDataUrl omitted
  const manifest = sheetStamps.map((stamp) => ({
    ts: stamp.ts,
    page: stamp.page,
    imageRef: imageRefFor(stamp.page),
    region: stamp.region,
  }));

  // Leadsheet track: one clip per page stamp. The trailing [full] makes the
  // page fill the AbleSet screen (per-clip full-screen, per AbleSet docs:
  // "[img:atw/atw-bass-1.png] [full]"). Belt-and-suspenders with the track's
  // [full] attribute so the sheet never renders tiny/inline.
  const leadsheetClips = sheetStamps.map((stamp) => ({
    ts: stamp.ts,
    clipName: `[img:${imageRefFor(stamp.page)}] [full]`,
  }));

  // Lyrics track (optional): one clip per lyric stamp, named with the line text.
  // Accepts entries shaped { ts: number, text?: string } | { ts, clipName }.
  const lyricClips: { ts: number; clipName: string }[] = Array.isArray(lyricStamps)
    ? lyricStamps
        .filter(
          (s): s is Record<string, unknown> =>
            typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>).ts === 'number',
        )
        .map((s) => ({
          ts: s.ts as number,
          clipName:
            typeof s.clipName === 'string'
              ? s.clipName
              : typeof s.text === 'string'
                ? s.text
                : '',
        }))
    : [];

  const tracks: AlsTrackSpec[] = [
    // [full] makes the page images fill the AbleSet screen (per AbleSet docs).
    // "+LYRICS" is required for AbleSet to recognise it as a lyrics/image track.
    { track: 'leadsheet', name: 'Leadsheet +LYRICS [full]', stamps: leadsheetClips },
  ];
  if (lyricClips.length > 0) {
    // Populate the chart/lyrics track too so both stamp tracks are filled.
    tracks.unshift({ track: 'chart', name: 'Vocals +LYRICS', stamps: lyricClips });
  }

  let stampsAls: Buffer;
  try {
    stampsAls = writeAlsFile({ tracks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 400, { error: `Failed to generate Stamps.als: ${message}` });
    return;
  }

  // Ableton project folder, e.g. "Great Things - E - 4:4 - 68 BPM Project".
  // Time signature comes from the live Ableton meter (defaults to 4:4).
  const sig = (typeof timeSig === 'object' && timeSig !== null) ? timeSig as Record<string, unknown> : {};
  const sigNum = typeof sig.num === 'number' && sig.num > 0 ? Math.round(sig.num) : 4;
  const sigDen = typeof sig.den === 'number' && sig.den > 0 ? Math.round(sig.den) : 4;
  const projectFolder = safeFolderName(`${songObj.name} - ${sigNum}:${sigDen} - ${Math.round(songObj.bpm)} BPM Project`);
  const alsFilename = `${safeFolderName(songObj.name)}.als`;

  let zipBuffer: Buffer;
  try {
    zipBuffer = await packLeadsheetZip({
      projectFolder,
      alsFilename,
      imagesSubdir: `Lyrics/${subfolder}`,
      pages,
      manifest,
      stampsAls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, { error: `Failed to build zip: ${message}` });
    return;
  }

  const filename = `${sanitizeFilename(songObj.name)}.zip`;

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': zipBuffer.byteLength,
  });
  res.end(zipBuffer);
}

// ---------------------------------------------------------------------------
// Live-write routes (Issue C)
// ---------------------------------------------------------------------------

/**
 * Convert an array of LyricStamps (song-relative) into the { name, beat }
 * pairs that writeStampClip expects. This is the single source of truth for
 * clip-name formatting — identical output to the /api/export/als route so
 * live-applied clips and .als export clips carry the same names.
 *
 * Each stamp's `text` field (per-stamp override) takes precedence over the
 * song line text, matching how the .als export builds clip names.
 */
export function stampsToClips(
  song: { lines: Array<{ text?: string }> },
  stamps: Array<{ idx: number; ts: number; text?: string }>,
): Array<{ name: string; beat: number; length: number }> {
  // Each clip extends to the NEXT stamp's beat so AbleSet shows the lyric until
  // the next line (it only displays a lyric while its clip is active). The last
  // clip falls back to DEFAULT_CLIP_LENGTH. Identical to the .als export
  // (als-writer: end = next beat, last = start + DEFAULT_CLIP_LENGTH).
  return stamps.map((stamp, idx) => {
    const beat = stamp.ts;
    const next = stamps[idx + 1];
    const length = next && next.ts > beat ? next.ts - beat : DEFAULT_CLIP_LENGTH;
    return {
      name: stamp.text ?? song.lines[stamp.idx]?.text ?? '',
      beat,
      length,
    };
  });
}

async function handleGetLiveTracks(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (_oscClient === null || !_oscClient.connected) {
    json(res, 503, { error: 'Ableton not connected' });
    return;
  }
  try {
    const tracks = await _oscClient.listTracks();
    json(res, 200, tracks);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 503, { error: `Failed to list tracks: ${message}` });
  }
}

/**
 * POST /api/live/tracks
 * Body: { name?: string }
 * Creates a new MIDI track in the live Ableton session and returns its index + name.
 * The final name has ` +LYRICS` appended if not already present (case-insensitive).
 * Empty or missing name defaults to "Lyrics +LYRICS".
 */
async function handlePostLiveTracks(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (_oscClient === null || !_oscClient.connected) {
    json(res, 503, { error: 'Ableton not connected' });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
    return;
  }

  let body: unknown;
  try {
    body = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'Body must be a JSON object' });
    return;
  }

  const b = body as Record<string, unknown>;

  if (b.name !== undefined && typeof b.name !== 'string') {
    json(res, 400, { error: 'name must be a string' });
    return;
  }

  // Compute the final track name: trim, append +LYRICS if absent, default to "Lyrics +LYRICS"
  const rawName = (typeof b.name === 'string' ? b.name : '').trim();
  let finalName: string;
  if (rawName === '') {
    finalName = 'Lyrics +LYRICS';
  } else if (/\+lyrics/i.test(rawName)) {
    finalName = rawName;
  } else {
    finalName = `${rawName} +LYRICS`;
  }

  try {
    const track = await _oscClient.createLyricsTrack(finalName);
    json(res, 200, track);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('not connected') || message.toLowerCase().includes('timeout')) {
      json(res, 503, { error: `Failed to create track: ${message}` });
    } else {
      json(res, 500, { error: `Failed to create track: ${message}` });
    }
  }
}

async function handlePostLiveApply(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (_oscClient === null || !_oscClient.connected) {
    json(res, 503, { error: 'Ableton not connected' });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'Body must be a JSON object' });
    return;
  }

  const b = body as Record<string, unknown>;

  if (typeof b.trackIndex !== 'number') {
    json(res, 400, { error: 'Missing or invalid field: trackIndex (number)' });
    return;
  }

  // Accept { trackIndex, song, stamps } — compute clip names server-side from
  // the song lines + per-stamp text overrides, identical to the .als export.
  if (
    typeof b.song !== 'object' ||
    b.song === null ||
    !Array.isArray((b.song as Record<string, unknown>).lines)
  ) {
    json(res, 400, { error: 'Missing or invalid field: song (object with lines array)' });
    return;
  }

  if (!Array.isArray(b.stamps)) {
    json(res, 400, { error: 'Missing or invalid field: stamps (array)' });
    return;
  }

  const rawStamps = b.stamps as unknown[];

  for (let i = 0; i < rawStamps.length; i++) {
    const s = rawStamps[i];
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as Record<string, unknown>).idx !== 'number' ||
      typeof (s as Record<string, unknown>).ts !== 'number'
    ) {
      json(res, 400, {
        error: `stamps[${i}] must have idx (number) and ts (number)`,
      });
      return;
    }
  }

  const songObj = b.song as { lines: Array<{ text?: string }> };
  const stampInputs = rawStamps as Array<{ idx: number; ts: number; text?: string }>;
  const clips = stampsToClips(songObj, stampInputs);
  const trackIndex = b.trackIndex as number;

  let written = 0;
  const failed: { name: string; beat: number; error: string }[] = [];

  // Write clips sequentially — they all reuse scratch slot 0; concurrent writes would collide.
  for (const clip of clips) {
    try {
      await _oscClient.writeStampClip(trackIndex, clip.name, clip.beat, clip.length);
      written++;
    } catch (err) {
      failed.push({
        name: clip.name,
        beat: clip.beat,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  json(res, 200, { written, failed });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Route an incoming HTTP request to the appropriate handler.
 * WebSocket upgrade requests are never passed here (handled by the upgrade
 * event in index.ts), so we don't need to worry about them.
 */
export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? '';
  const url = req.url ?? '';
  // Strip query string for routing
  const path = url.split('?')[0];

  if (method === 'GET' && path === '/api/health') {
    handleHealth(req, res);
    return;
  }

  if (method === 'POST' && path === '/api/song') {
    await handlePostSong(req, res);
    return;
  }

  if (method === 'POST' && path === '/api/export/als') {
    await handlePostExportAls(req, res);
    return;
  }

  if (method === 'POST' && path === '/api/export/zip') {
    await handlePostExportZip(req, res);
    return;
  }

  // ---- Live-write routes ----

  if (method === 'GET' && path === '/api/live/tracks') {
    await handleGetLiveTracks(req, res);
    return;
  }

  if (method === 'POST' && path === '/api/live/tracks') {
    await handlePostLiveTracks(req, res);
    return;
  }

  if (method === 'POST' && path === '/api/live/apply') {
    await handlePostLiveApply(req, res);
    return;
  }

  // ---- Session routes ----

  if (method === 'GET' && path === '/api/sessions') {
    json(res, 200, await listSessions());
    return;
  }

  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  const sessionPdfMatch = path.match(/^\/api\/sessions\/([^/]+)\/pdf$/);

  if (method === 'GET' && sessionPdfMatch) {
    const id = decodeURIComponent(sessionPdfMatch[1]);
    const pdf = await getSessionPdf(id);
    if (!pdf) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': pdf.type,
      'Content-Length': pdf.bytes.byteLength,
    });
    res.end(pdf.bytes);
    return;
  }

  if (method === 'GET' && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const full = await getSession(id);
    if (!full) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    json(res, 200, { meta: full.meta, state: full.state, hasPdf: full.meta.hasPdf });
    return;
  }

  if (method === 'PUT' && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      json(res, 400, { error: 'Failed to read request body' });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    if (typeof body !== 'object' || body === null) {
      json(res, 400, { error: 'Body must be a JSON object' });
      return;
    }
    const b = body as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name : '';
    const savedAt = typeof b.savedAt === 'number' ? b.savedAt : 0;
    const state = (typeof b.state === 'object' && b.state !== null
      ? b.state
      : {}) as Record<string, unknown>;

    let pdf: { bytes: Buffer; name: string; type: string } | null = null;
    if (typeof b.pdf === 'string' && b.pdf.length > 0) {
      const pdfBytes = Buffer.from(b.pdf, 'base64');
      const pdfName = typeof b.pdfName === 'string' ? b.pdfName : `${id}.pdf`;
      const pdfType = typeof b.pdfType === 'string' ? b.pdfType : 'application/pdf';
      pdf = { bytes: pdfBytes, name: pdfName, type: pdfType };
    }

    const meta = await saveSession({ id, name, savedAt, state, pdf });
    json(res, 200, meta);
    return;
  }

  if (method === 'DELETE' && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    await deleteSession(id);
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && path.startsWith('/api/')) {
    json(res, 404, { error: 'Not found' });
    return;
  }

  if (method === 'GET') {
    serveStatic(req, res);
    return;
  }

  json(res, 404, { error: 'Not found' });
}
