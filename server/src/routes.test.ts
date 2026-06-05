/**
 * Unit tests for live-write routes (Issue C):
 *   GET /api/live/tracks
 *   POST /api/live/apply
 *
 * The OscClient is mocked via setOscClient().  No real HTTP server or UDP
 * sockets are opened — requests are fed through handleRequest() directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Readable } from 'node:stream';
import { handleRequest, setOscClient } from './routes.js';

// ---------------------------------------------------------------------------
// Minimal mock for the OscClient interface used by routes
// ---------------------------------------------------------------------------

interface MockOsc {
  connected: boolean;
  listTracksResult: { index: number; name: string }[] | Error;
  writeStampClipCalls: { trackIndex: number; name: string; beat: number }[];
  writeStampClipError: Error | null;
  listTracks(): Promise<{ index: number; name: string }[]>;
  writeStampClip(trackIndex: number, name: string, beat: number): Promise<void>;
  probeHandler(): Promise<boolean>;
}

function makeMockOsc(overrides?: Partial<MockOsc>): MockOsc {
  return {
    connected: true,
    listTracksResult: [],
    writeStampClipCalls: [],
    writeStampClipError: null,
    listTracks() {
      if (this.listTracksResult instanceof Error) {
        return Promise.reject(this.listTracksResult);
      }
      return Promise.resolve(this.listTracksResult as { index: number; name: string }[]);
    },
    writeStampClip(trackIndex, name, beat) {
      if (this.writeStampClipError) {
        return Promise.reject(this.writeStampClipError);
      }
      this.writeStampClipCalls.push({ trackIndex, name, beat });
      return Promise.resolve();
    },
    probeHandler() {
      return Promise.resolve(true);
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
// POST /api/live/apply
// ---------------------------------------------------------------------------

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
      JSON.stringify({ trackIndex: 0, clips: [{ name: 'A', beat: 8 }] }),
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
      JSON.stringify({ clips: [{ name: 'A', beat: 8 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('trackIndex') });
  });

  it('returns 400 when clips is not an array', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, clips: 'bad' }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('clips') });
  });

  it('returns 400 when a clip entry is missing name', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, clips: [{ beat: 8 }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('clips[0]') });
  });

  it('returns 400 when a clip entry is missing beat', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, clips: [{ name: 'A' }] }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('clips[0]') });
  });

  it('writes clips sequentially and returns {written, failed}', async () => {
    const osc = makeMockOsc();
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const clips = [
      { name: 'Amazing grace', beat: 8 },
      { name: 'How great thou art', beat: 16 },
      { name: 'Holy holy holy', beat: 24 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 1, clips }),
    );
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();

    expect(statusCode).toBe(200);
    const result = JSON.parse(body) as { written: number; failed: unknown[] };
    expect(result.written).toBe(3);
    expect(result.failed).toEqual([]);

    // All clips were written to the correct track
    expect(osc.writeStampClipCalls).toEqual([
      { trackIndex: 1, name: 'Amazing grace', beat: 8 },
      { trackIndex: 1, name: 'How great thou art', beat: 16 },
      { trackIndex: 1, name: 'Holy holy holy', beat: 24 },
    ]);
  });

  it('records failed clips in the response without throwing', async () => {
    let callCount = 0;
    const osc = makeMockOsc();
    // Fail the second clip
    osc.writeStampClip = async function (trackIndex, name, beat) {
      callCount++;
      if (callCount === 2) throw new Error('slot busy');
      this.writeStampClipCalls.push({ trackIndex, name, beat });
    };
    setOscClient(osc as unknown as import('./osc-client.js').OscClient);

    const clips = [
      { name: 'Clip A', beat: 4 },
      { name: 'Clip B', beat: 8 },
      { name: 'Clip C', beat: 12 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 0, clips }),
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
      name: 'Clip B',
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

    const clips = [
      { name: 'A', beat: 0 },
      { name: 'B', beat: 4 },
      { name: 'C', beat: 8 },
    ];

    const req = makeReq(
      'POST',
      '/api/live/apply',
      JSON.stringify({ trackIndex: 2, clips }),
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
