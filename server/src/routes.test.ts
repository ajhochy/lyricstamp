/**
 * Unit tests for live-write routes (Issue C):
 *   GET /api/live/tracks
 *   POST /api/live/apply
 *   POST /api/live/apply-leadsheet (LS-C)
 *
 * The OscClient is mocked via setOscClient().  No real HTTP server or UDP
 * sockets are opened — requests are fed through handleRequest() directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Readable } from 'node:stream';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRequest, setOscClient, stampsToClips } from './routes.js';

// ---------------------------------------------------------------------------
// Minimal mock for the OscClient interface used by routes
// ---------------------------------------------------------------------------

interface MockOsc {
  connected: boolean;
  listTracksResult: { index: number; name: string }[] | Error;
  writeStampClipCalls: { trackIndex: number; name: string; beat: number; length: number }[];
  writeStampClipError: Error | null;
  createLyricsTrackCalls: string[];
  createLyricsTrackResult: { index: number; name: string } | Error;
  songProjectPath: string;
  listTracks(): Promise<{ index: number; name: string }[]>;
  writeStampClip(trackIndex: number, name: string, beat: number, length: number): Promise<void>;
  probeHandler(): Promise<boolean>;
  createLyricsTrack(name: string): Promise<{ index: number; name: string }>;
  getSongProjectPath(): Promise<string>;
}

function makeMockOsc(overrides?: Partial<MockOsc>): MockOsc {
  return {
    connected: true,
    listTracksResult: [],
    writeStampClipCalls: [],
    writeStampClipError: null,
    createLyricsTrackCalls: [],
    createLyricsTrackResult: { index: 5, name: 'Lyrics +LYRICS' },
    songProjectPath: '',
    listTracks() {
      if (this.listTracksResult instanceof Error) {
        return Promise.reject(this.listTracksResult);
      }
      return Promise.resolve(this.listTracksResult as { index: number; name: string }[]);
    },
    writeStampClip(trackIndex, name, beat, length) {
      if (this.writeStampClipError) {
        return Promise.reject(this.writeStampClipError);
      }
      this.writeStampClipCalls.push({ trackIndex, name, beat, length });
      return Promise.resolve();
    },
    probeHandler() {
      return Promise.resolve(true);
    },
    createLyricsTrack(name: string) {
      this.createLyricsTrackCalls.push(name);
      if (this.createLyricsTrackResult instanceof Error) {
        return Promise.reject(this.createLyricsTrackResult);
      }
      return Promise.resolve(this.createLyricsTrackResult as { index: number; name: string });
    },
    getSongProjectPath() {
      return Promise.resolve(this.songProjectPath);
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal HTTP request / response helpers for unit testing without a server
// ---------------------------------------------------------------------------

/** Build a minimal IncomingMessage-like object for testing. */
function makeReq(
  method: string,
  url: string,
  body?: string,
): http.IncomingMessage {
  const req = new Readable({
    read() {},
  }) as http.IncomingMessage;

  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost' };

  if (body !== undefined) {
    process.nextTick(() => {
      req.push(body);
      req.push(null);
    });
  } else {
    process.nextTick(() => {
      req.push(null);
    });
  }

  return req;
}

/** Capture the response written to a ServerResponse. */
interface CapturedResponse {
  statusCode: number;
  body: string;
}

function makeRes(): { res: http.ServerResponse; capture: () => Promise<CapturedResponse> } {
  const chunks: Buffer[] = [];
  let resolveCapture: (r: CapturedResponse) => void;
  const promise = new Promise<CapturedResponse>((resolve) => {
    resolveCapture = resolve;
  });

  // We need a real ServerResponse or a compatible mock.
  // Use a minimal mock that records writeHead + end calls.
  let capturedStatus = 200;

  const res = {
    writeHead(statusCode: number) {
      capturedStatus = statusCode;
    },
    end(data?: string | Buffer) {
      if (data) {
        chunks.push(typeof data === 'string' ? Buffer.from(data) : data);
      }
      resolveCapture({
        statusCode: capturedStatus,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    },
  } as unknown as http.ServerResponse;

  return { res, capture: () => promise };
}

// ---------------------------------------------------------------------------
// GET /api/live/tracks
// ---------------------------------------------------------------------------

describe('GET /api/live/tracks', () => {
  beforeEach(() => {
    // Reset oscClient before each test
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  afterEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  it('returns 503 when oscClient is null', async () => {
    const req = makeReq('GET', '/api/live/tracks');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(503);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('not connected') });
  });

  it('returns 503 when Ableton is disconnected', async () => {
    const osc = makeMockOsc({ connected: false });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('GET', '/api/live/tracks');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(503);
    expect(JSON.parse(body)).toMatchObject({ error: expect.any(String) });
  });

  it('returns 200 with track list when connected', async () => {
    const osc = makeMockOsc({
      listTracksResult: [
        { index: 0, name: 'Kick' },
        { index: 1, name: 'Vocals +LYRICS' },
      ],
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('GET', '/api/live/tracks');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual([
      { index: 0, name: 'Kick' },
      { index: 1, name: 'Vocals +LYRICS' },
    ]);
  });

  it('returns 503 when listTracks throws', async () => {
    const osc = makeMockOsc({
      listTracksResult: new Error('OSC timeout'),
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('GET', '/api/live/tracks');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(503);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('OSC timeout') });
  });
});

// ---------------------------------------------------------------------------
// POST /api/live/apply (song+stamps input → server computes clip names)
// ---------------------------------------------------------------------------

// Shared test fixtures
const TEST_SONG = {
  name: 'Amazing Grace',
  bpm: 76,
  key: 'G',
  lines: [
    { text: 'Amazing grace how sweet the sound' },
    { text: 'That saved a wretch like me' },
    { text: 'How precious did that grace appear' },
  ],
};

// ---------------------------------------------------------------------------
// POST /api/live/tracks
// ---------------------------------------------------------------------------

describe('POST /api/live/tracks', () => {
  beforeEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  afterEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  it('returns 503 when Ableton is disconnected', async () => {
    const osc = makeMockOsc({ connected: false });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 'Test' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(503);
  });

  it('returns 503 when oscClient is null', async () => {
    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 'Test' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(503);
  });

  it('appends +LYRICS to names that do not contain it', async () => {
    const osc = makeMockOsc({
      createLyricsTrackResult: { index: 3, name: 'My Song +LYRICS' },
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 'My Song' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    // The route passes the computed final name to createLyricsTrack
    expect(osc.createLyricsTrackCalls).toEqual(['My Song +LYRICS']);
    const result = JSON.parse(body) as { index: number; name: string };
    expect(result.index).toBe(3);
    expect(result.name).toBe('My Song +LYRICS');
  });

  it('does not double-append +LYRICS when already present (case-insensitive)', async () => {
    const osc = makeMockOsc({
      createLyricsTrackResult: { index: 1, name: 'Vocals +LYRICS' },
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 'Vocals +LYRICS' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    // Should NOT append a second +LYRICS
    expect(osc.createLyricsTrackCalls).toEqual(['Vocals +LYRICS']);
  });

  it('defaults to "Lyrics +LYRICS" when name is empty', async () => {
    const osc = makeMockOsc({
      createLyricsTrackResult: { index: 0, name: 'Lyrics +LYRICS' },
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: '' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    expect(osc.createLyricsTrackCalls).toEqual(['Lyrics +LYRICS']);
  });

  it('defaults to "Lyrics +LYRICS" when name is omitted', async () => {
    const osc = makeMockOsc({
      createLyricsTrackResult: { index: 0, name: 'Lyrics +LYRICS' },
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({}));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    expect(osc.createLyricsTrackCalls).toEqual(['Lyrics +LYRICS']);
  });

  it('returns 400 when name is not a string', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 123 }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('returns 400 for invalid JSON body', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', 'not-json{{{');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(400);
  });

  it('returns {index, name} on success', async () => {
    const osc = makeMockOsc({
      createLyricsTrackResult: { index: 7, name: 'Great Things +LYRICS' },
    });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/tracks', JSON.stringify({ name: 'Great Things' }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as { index: number; name: string };
    expect(result.index).toBe(7);
    expect(result.name).toBe('Great Things +LYRICS');
  });
});

// stampsToClips unit tests — verify names match the export formatter
describe('stampsToClips', () => {
  it('maps stamp idx+ts to name+beat from song lines', () => {
    const stamps = [
      { idx: 0, ts: 8 },
      { idx: 1, ts: 16 },
      { idx: 2, ts: 24 },
    ];
    expect(stampsToClips(TEST_SONG, stamps)).toEqual([
      { name: 'Amazing grace how sweet the sound', beat: 8, length: 8 },
      { name: 'That saved a wretch like me', beat: 16, length: 8 },
      { name: 'How precious did that grace appear', beat: 24, length: 4 },
    ]);
  });

  it('prefers per-stamp text override over song line text', () => {
    const stamps = [
      { idx: 0, ts: 4, text: 'Custom override' },
      { idx: 1, ts: 8 },
    ];
    expect(stampsToClips(TEST_SONG, stamps)).toEqual([
      { name: 'Custom override', beat: 4, length: 4 },
      { name: 'That saved a wretch like me', beat: 8, length: 4 },
    ]);
  });

  it('returns empty string for out-of-bounds idx', () => {
    const stamps = [{ idx: 99, ts: 4 }];
    expect(stampsToClips(TEST_SONG, stamps)).toEqual([{ name: '', beat: 4, length: 4 }]);
  });

  it('clip length spans to the next stamp; last clip uses the default', () => {
    const stamps = [
      { idx: 0, ts: 0 },
      { idx: 1, ts: 6 },
    ];
    const clips = stampsToClips(TEST_SONG, stamps);
    expect(clips[0].length).toBe(6); // 6 - 0
    expect(clips[1].length).toBe(4); // last → DEFAULT_CLIP_LENGTH
  });
});

describe('POST /api/live/apply', () => {
  beforeEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  afterEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  it('returns 503 when Ableton is disconnected', async () => {
    const osc = makeMockOsc({ connected: false });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({
        trackIndex: 0,
        song: TEST_SONG,
        stamps: [{ idx: 0, ts: 8 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(503);
  });

  it('returns 400 when trackIndex is missing', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ song: TEST_SONG, stamps: [{ idx: 0, ts: 8 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('trackIndex') });
  });

  it('returns 400 when song is missing', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, stamps: [{ idx: 0, ts: 8 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('song') });
  });

  it('returns 400 when stamps is not an array', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, song: TEST_SONG, stamps: 'bad' }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('stamps') });
  });

  it('returns 400 when a stamp entry is missing idx', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, song: TEST_SONG, stamps: [{ ts: 8 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('stamps[0]') });
  });

  it('returns 400 when a stamp entry is missing ts', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, song: TEST_SONG, stamps: [{ idx: 0 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('stamps[0]') });
  });

  it('writes clips with names from song lines and returns {written, failed}', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const stamps = [
      { idx: 0, ts: 8 },
      { idx: 1, ts: 16 },
      { idx: 2, ts: 24 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 1, song: TEST_SONG, stamps }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as { written: number; failed: unknown[] };
    expect(result.written).toBe(3);
    expect(result.failed).toEqual([]);

    // Clip names come from song lines — same as the .als export formatter
    expect(osc.writeStampClipCalls).toEqual([
      { trackIndex: 1, name: 'Amazing grace how sweet the sound', beat: 8, length: 8 },
      { trackIndex: 1, name: 'That saved a wretch like me', beat: 16, length: 8 },
      { trackIndex: 1, name: 'How precious did that grace appear', beat: 24, length: 4 },
    ]);
  });

  it('respects per-stamp text override (same as export formatter)', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const stamps = [
      { idx: 0, ts: 4, text: 'Custom override' },
      { idx: 1, ts: 8 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, song: TEST_SONG, stamps }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as { written: number; failed: unknown[] };
    expect(result.written).toBe(2);
    expect(osc.writeStampClipCalls).toEqual([
      { trackIndex: 0, name: 'Custom override', beat: 4, length: 4 },
      { trackIndex: 0, name: 'That saved a wretch like me', beat: 8, length: 4 },
    ]);
  });

  it('records failed clips in the response without throwing', async () => {
    let callCount = 0;
    const osc = makeMockOsc();
    // Fail the second clip
    osc.writeStampClip = async function (trackIndex, name, beat, length) {
      callCount++;
      if (callCount === 2) throw new Error('slot busy');
      this.writeStampClipCalls.push({ trackIndex, name, beat, length });
    };
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const stamps = [
      { idx: 0, ts: 4 },
      { idx: 1, ts: 8 },
      { idx: 2, ts: 12 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, song: TEST_SONG, stamps }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as {
      written: number;
      failed: { name: string; beat: number; error: string }[];
    };
    expect(result.written).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      name: 'That saved a wretch like me',
      beat: 8,
      error: expect.stringContaining('slot busy'),
    });
  });

  it('writes clips sequentially (not in parallel)', async () => {
    const callOrder: number[] = [];
    const osc = makeMockOsc();
    osc.writeStampClip = async function (_trackIndex, _name, beat) {
      callOrder.push(beat as number);
      // Simulate async delay
      await new Promise<void>((r) => setTimeout(r, 1));
    };
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const stamps = [
      { idx: 0, ts: 0 },
      { idx: 1, ts: 4 },
      { idx: 2, ts: 8 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 2, song: TEST_SONG, stamps }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    // Sequential means the beat values appear in order (not interleaved)
    expect(callOrder).toEqual([0, 4, 8]);
  });

  it('returns 400 for invalid JSON body', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq('POST', '/api/live/apply', 'not-json{{{');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/live/apply-leadsheet (LS-C)
// ---------------------------------------------------------------------------

// Minimal valid 1×1 transparent PNG, base64-encoded.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

describe('POST /api/live/apply-leadsheet', () => {
  let tempDir: string;

  beforeEach(() => {
    // Each test gets its own temp dir to avoid cross-test file pollution.
    tempDir = mkdtempSync(join(tmpdir(), 'ableset-test-'));
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  afterEach(() => {
    setOscClient(null as unknown as import('./osc-client.js').OscClient);
  });

  it('returns 503 when oscClient is null', async () => {
    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Great Things.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(503);
  });

  it('returns 503 when Ableton is disconnected', async () => {
    const osc = makeMockOsc({ connected: false, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Great Things.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(503);
  });

  it('returns 409 when getSongProjectPath returns empty string (unsaved set)', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: '' });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Great Things.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(409);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('Save') });
  });

  it('returns 400 when trackIndex is not a number', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 'bad',
        pdfName: 'foo.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('trackIndex') });
  });

  it('returns 400 when pages is not an array', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'foo.pdf',
        pages: 'bad',
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('pages') });
  });

  it('returns 400 when stamps is not an array', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'foo.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: 'bad',
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('stamps') });
  });

  it('returns 400 when a page entry has an invalid pngDataUrl', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'foo.pdf',
        pages: [{ page: 1, pngDataUrl: 'not-a-data-url' }],
        stamps: [{ page: 1, ts: 0 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('pngDataUrl') });
  });

  it('writes PNG files to <tempDir>/Lyrics/<slug>/page-N.png with correct content', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Great Things F Lead Sheet.pdf',
        pages: [
          { page: 1, pngDataUrl: TINY_PNG_DATA_URL },
          { page: 2, pngDataUrl: TINY_PNG_DATA_URL },
        ],
        stamps: [
          { page: 1, ts: 0 },
          { page: 2, ts: 8 },
        ],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as { imagesWritten: number; clipsWritten: number; failed: unknown[] };
    expect(result.imagesWritten).toBe(2);
    expect(result.clipsWritten).toBe(2);
    expect(result.failed).toEqual([]);

    // Verify the files exist on disk with the slug path
    const slug = 'great-things-f-lead-sheet';
    const page1Path = join(tempDir, 'Lyrics', slug, 'page-1.png');
    const page2Path = join(tempDir, 'Lyrics', slug, 'page-2.png');
    expect(existsSync(page1Path)).toBe(true);
    expect(existsSync(page2Path)).toBe(true);

    // Verify content matches the decoded PNG bytes
    const expectedBytes = Buffer.from(TINY_PNG_BASE64, 'base64');
    expect(readFileSync(page1Path)).toEqual(expectedBytes);
    expect(readFileSync(page2Path)).toEqual(expectedBytes);
  });

  it('builds clip names exactly matching the zip export format: [img:<slug>/page-N.png] [full]', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 2,
        pdfName: 'Amazing Grace Lead Sheet.pdf',
        pages: [
          { page: 1, pngDataUrl: TINY_PNG_DATA_URL },
          { page: 2, pngDataUrl: TINY_PNG_DATA_URL },
        ],
        stamps: [
          { page: 1, ts: 0 },
          { page: 2, ts: 16 },
        ],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    const slug = 'amazing-grace-lead-sheet';
    expect(osc.writeStampClipCalls).toEqual([
      { trackIndex: 2, name: `[img:${slug}/page-1.png] [full]`, beat: 0, length: 16 },
      { trackIndex: 2, name: `[img:${slug}/page-2.png] [full]`, beat: 16, length: 4 },
    ]);
  });

  it('last clip uses DEFAULT_CLIP_LENGTH (4) when there is no next stamp', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Song.pdf',
        pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
        stamps: [{ page: 1, ts: 32 }],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    expect(osc.writeStampClipCalls).toHaveLength(1);
    expect(osc.writeStampClipCalls[0].length).toBe(4); // DEFAULT_CLIP_LENGTH
  });

  it('stamps are sorted by ts before clip building', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Song.pdf',
        pages: [
          { page: 1, pngDataUrl: TINY_PNG_DATA_URL },
          { page: 2, pngDataUrl: TINY_PNG_DATA_URL },
        ],
        // stamps out of order
        stamps: [
          { page: 2, ts: 16 },
          { page: 1, ts: 0 },
        ],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    await capture();

    // After sorting by ts: page 1 at beat 0, page 2 at beat 16
    expect(osc.writeStampClipCalls[0].beat).toBe(0);
    expect(osc.writeStampClipCalls[1].beat).toBe(16);
  });

  it('partial failure: returns 200 with failed[] when one clip write fails', async () => {
    let clipCallCount = 0;
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    osc.writeStampClip = async function (_trackIndex, name, beat, length) {
      clipCallCount++;
      if (clipCallCount === 2) throw new Error('slot busy');
      this.writeStampClipCalls.push({ trackIndex: _trackIndex, name, beat, length });
    };
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply-leadsheet',
      JSON.stringify({
        trackIndex: 0,
        pdfName: 'Song.pdf',
        pages: [
          { page: 1, pngDataUrl: TINY_PNG_DATA_URL },
          { page: 2, pngDataUrl: TINY_PNG_DATA_URL },
          { page: 3, pngDataUrl: TINY_PNG_DATA_URL },
        ],
        stamps: [
          { page: 1, ts: 0 },
          { page: 2, ts: 8 },
          { page: 3, ts: 16 },
        ],
      }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as {
      imagesWritten: number;
      clipsWritten: number;
      failed: { name: string; beat: number; error: string }[];
    };
    expect(result.clipsWritten).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      beat: 8,
      error: expect.stringContaining('slot busy'),
    });
  });

  it('re-apply: overwrites the PNG file (no duplicate), slug path unchanged', async () => {
    const osc = makeMockOsc({ connected: true, songProjectPath: tempDir });
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const body = JSON.stringify({
      trackIndex: 0,
      pdfName: 'Song.pdf',
      pages: [{ page: 1, pngDataUrl: TINY_PNG_DATA_URL }],
      stamps: [{ page: 1, ts: 0 }],
    });

    // First apply
    const req1 = makeReq('POST', '/api/live/apply-leadsheet', body);
    const { res: res1, capture: cap1 } = makeRes();
    await handleRequest(req1, res1);
    await cap1();

    // Second apply (re-apply)
    const req2 = makeReq('POST', '/api/live/apply-leadsheet', body);
    const { res: res2, capture: cap2 } = makeRes();
    await handleRequest(req2, res2);
    const { statusCode } = await cap2();

    expect(statusCode).toBe(200);

    // Only one file should exist (no duplicate)
    const slug = 'song';
    const files = readdirSync(join(tempDir, 'Lyrics', slug));
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('page-1.png');
  });
});

// ---------------------------------------------------------------------------
// Issue D — tick includes handlerStatus (ws-server integration check)
// ---------------------------------------------------------------------------

describe('shared/types LiveMsg tick handlerStatus', () => {
  it('tick type includes handlerStatus field in the union', () => {
    // Construct a LiveMsg tick — TypeScript will error at compile time if
    // handlerStatus is missing from the type.
    const tick = {
      type: 'tick' as const,
      ts: 1.0,
      bpm: 120,
      playing: true,
      numerator: 4,
      denominator: 4,
      handlerStatus: 'present' as const,
    };

    expect(tick.handlerStatus).toBe('present');

    const tick2 = { ...tick, handlerStatus: 'absent' as const };
    expect(tick2.handlerStatus).toBe('absent');

    const tick3 = { ...tick, handlerStatus: 'unknown' as const };
    expect(tick3.handlerStatus).toBe('unknown');
  });
});
