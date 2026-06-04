import type http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { parseChordPro } from './chordpro.js';
import { writeAlsFile } from './als-writer.js';
import { packLeadsheetZip } from './zip-packer.js';
import type { Song, LyricStamp, SheetStamp } from '../../shared/types.js';

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

/** Sanitize a song name for use as a filename. */
function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
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
    clipName: `${stamp.lineIdx + 1}: ${stamp.lineText.slice(0, 24)}`,
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

  // Dedupe pages by page number — pick the first stamp encountered per page
  const pageMap = new Map<number, { filename: string; pngBuffer: Buffer }>();
  for (const stamp of sheetStamps) {
    if (!pageMap.has(stamp.page)) {
      const pngBuffer = decodePngDataUrl(stamp.pngDataUrl);
      if (pngBuffer === null) {
        json(res, 400, { error: `stamps entry for page ${stamp.page} has invalid pngDataUrl: must be a data:image/png;base64,... URL` });
        return;
      }
      pageMap.set(stamp.page, { filename: `page${stamp.page}.png`, pngBuffer });
    }
  }
  const pages = Array.from(pageMap.values());

  // Build manifest — all stamps in original order, pngDataUrl omitted
  const manifest = sheetStamps.map((stamp) => ({
    ts: stamp.ts,
    page: stamp.page,
    imageRef: stamp.imageRef,
    region: stamp.region,
  }));

  // Build .als clip inputs using [img:imageRef] naming
  const stampInputs = sheetStamps.map((stamp) => ({
    ts: stamp.ts,
    clipName: `[img:${stamp.imageRef}]`,
  }));

  let stampsAls: Buffer;
  try {
    stampsAls = writeAlsFile({
      bpm: songObj.bpm,
      trackName: 'Vocals +LYRICS',
      stamps: stampInputs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 400, { error: `Failed to generate Stamps.als: ${message}` });
    return;
  }

  let zipBuffer: Buffer;
  try {
    zipBuffer = await packLeadsheetZip({ pages, manifest, stampsAls });
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
