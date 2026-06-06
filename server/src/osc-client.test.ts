/**
 * Unit tests for OscClient issue-B methods:
 *   listTracks, writeStampClip, probeHandler
 *
 * The OSC transport is mocked by subclassing OscClient and overriding
 * the protected _oscSend / _registerReply seam — no UDP sockets opened.
 */

import { describe, it, expect, vi } from 'vitest';
import { OscClient } from './osc-client.js';

// ---------------------------------------------------------------------------
// Mock transport subclass
// ---------------------------------------------------------------------------

type SentCall = { address: string; args: unknown[] };

class MockOscClient extends OscClient {
  /** All _oscSend calls recorded in order. */
  sent: SentCall[] = [];

  /** Override to record sends instead of touching a real socket. */
  protected override _oscSend(address: string, ...args: unknown[]): void {
    this.sent.push({ address, args });
    // Auto-dispatch mocked reply if one is queued for this address
    this._dispatchMocked(address, args);
  }

  /** Queued mock replies: address → list of payloads to return (FIFO). */
  private _mockReplies = new Map<string, unknown[][]>();

  /** Queue a reply that will be dispatched the next time `address` is sent. */
  queueReply(address: string, payload: unknown[]): void {
    const q = this._mockReplies.get(address) ?? [];
    q.push(payload);
    this._mockReplies.set(address, q);
  }

  /** After a send, check if there is a queued reply and dispatch it. */
  private _dispatchMocked(sendAddress: string, _args: unknown[]): void {
    // The reply address typically equals the send address for AbletonOSC get/set.
    const queue = this._mockReplies.get(sendAddress);
    if (!queue || queue.length === 0) return;
    const payload = queue.shift()!;
    if (queue.length === 0) this._mockReplies.delete(sendAddress);

    // Fire the first waiting reply handler for this address.
    // _registerReply is a protected method we can call from this subclass.
    this._fireReplyNow(sendAddress, payload);
  }

  /** Manually fire a reply for `address` with `payload`. */
  _fireReplyNow(address: string, payload: unknown[]): void {
    // Access the internal reply handler map via the protected _registerReply
    // indirection — register a no-op to read the map, then call manually.
    // Instead we expose a helper that fires directly:
    (this as unknown as {
      _replyHandlers: Map<string, ((msg: unknown[]) => void)[]>;
    })._replyHandlers.get(address)?.at(0)?.(payload);
    // Remove the handler we just fired (mimic shift behaviour)
    const handlers = (this as unknown as {
      _replyHandlers: Map<string, ((msg: unknown[]) => void)[]>;
    })._replyHandlers.get(address);
    if (handlers && handlers.length > 0) {
      handlers.shift();
      if (handlers.length === 0) {
        (this as unknown as {
          _replyHandlers: Map<string, ((msg: unknown[]) => void)[]>;
        })._replyHandlers.delete(address);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMock(): MockOscClient {
  return new MockOscClient();
}

// ---------------------------------------------------------------------------
// listTracks
// ---------------------------------------------------------------------------

describe('OscClient.listTracks', () => {
  it('sends /live/song/get/num_tracks then /live/track/get/name for each track', async () => {
    const mock = makeMock();

    // Queue reply for num_tracks: 3 tracks
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 3]);
    // Queue replies for each track name
    mock.queueReply('/live/track/get/name', ['/live/track/get/name', 0, 'Kick']);
    mock.queueReply('/live/track/get/name', ['/live/track/get/name', 1, 'Vocals +LYRICS']);
    mock.queueReply('/live/track/get/name', ['/live/track/get/name', 2, 'Bass']);

    const tracks = await mock.listTracks();

    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual({ index: 0, name: 'Kick' });
    expect(tracks[1]).toEqual({ index: 1, name: 'Vocals +LYRICS' });
    expect(tracks[2]).toEqual({ index: 2, name: 'Bass' });

    // First send must be the num_tracks probe
    expect(mock.sent[0].address).toBe('/live/song/get/num_tracks');
  });

  it('returns an empty array when num_tracks is 0', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 0]);

    const tracks = await mock.listTracks();
    expect(tracks).toEqual([]);
  });

  it('sorts tracks by index', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 2]);
    // Replies arrive out-of-order (index 1 first)
    mock.queueReply('/live/track/get/name', ['/live/track/get/name', 1, 'Second']);
    mock.queueReply('/live/track/get/name', ['/live/track/get/name', 0, 'First']);

    const tracks = await mock.listTracks();
    expect(tracks[0].index).toBe(0);
    expect(tracks[1].index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// writeStampClip
// ---------------------------------------------------------------------------

describe('OscClient.writeStampClip', () => {
  it('sends create_clip → set/name → duplicate_clip_to_arrangement → delete_clip in order', async () => {
    const mock = makeMock();

    // Queue reply for the duplicate step (the only awaited one)
    mock.queueReply(
      '/live/track/duplicate_clip_to_arrangement',
      ['/live/track/duplicate_clip_to_arrangement', 2, 0, 8],
    );

    await mock.writeStampClip(2, 'Amazing grace', 8);

    const addresses = mock.sent.map((s) => s.address);
    expect(addresses).toEqual([
      '/live/clip_slot/create_clip',
      '/live/clip/set/name',
      '/live/track/duplicate_clip_to_arrangement',
      '/live/clip_slot/delete_clip',
    ]);
  });

  it('sends correct arguments for each OSC message', async () => {
    const mock = makeMock();
    mock.queueReply(
      '/live/track/duplicate_clip_to_arrangement',
      ['/live/track/duplicate_clip_to_arrangement', 3, 0, 16],
    );

    await mock.writeStampClip(3, 'How great thou art', 16, 8);

    const [create, setName, duplicate, deleteClip] = mock.sent;

    // create_clip uses the passed length so the arrangement clip spans to the next stamp
    expect(create.args).toEqual([3, 0, 8]);
    expect(setName.args).toEqual([3, 0, 'How great thou art']);
    expect(duplicate.args).toEqual([3, 0, 16]);
    expect(deleteClip.args).toEqual([3, 0]);
  });

  it('rejects on timeout (no reply to duplicate_clip_to_arrangement)', async () => {
    const mock = makeMock();
    // Do NOT queue a reply — the request should time out

    // Shorten the timeout for the test by monkey-patching the private field
    // Access private _request via a wrapper that overrides the timeout
    const origRequest = (mock as unknown as {
      _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
    })._request.bind(mock);

    vi.spyOn(
      mock as unknown as {
        _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
      },
      '_request',
    ).mockImplementation((addr, args, replyAddr, _timeout) => {
      if (addr === '/live/track/duplicate_clip_to_arrangement') {
        return origRequest(addr, args, replyAddr, 10); // 10 ms timeout
      }
      return origRequest(addr, args, replyAddr, _timeout);
    });

    await expect(mock.writeStampClip(0, 'test', 4)).rejects.toThrow(/timeout/i);
  });
});

// ---------------------------------------------------------------------------
// createLyricsTrack
// ---------------------------------------------------------------------------

describe('OscClient.createLyricsTrack', () => {
  it('sends num_tracks → create_midi_track → set/name and returns {index, name}', async () => {
    const mock = makeMock();

    // Queue num_tracks reply: 4 existing tracks → new track gets index 4
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 4]);

    const result = await mock.createLyricsTrack('My Song +LYRICS');

    expect(result).toEqual({ index: 4, name: 'My Song +LYRICS' });

    const addresses = mock.sent.map((s) => s.address);
    // Must include num_tracks probe, then create_midi_track, then set/name
    expect(addresses).toContain('/live/song/get/num_tracks');
    expect(addresses).toContain('/live/song/create_midi_track');
    expect(addresses).toContain('/live/track/set/name');

    // Order: num_tracks first, then create, then set/name
    const numIdx = addresses.indexOf('/live/song/get/num_tracks');
    const createIdx = addresses.indexOf('/live/song/create_midi_track');
    const setNameIdx = addresses.indexOf('/live/track/set/name');
    expect(numIdx).toBeLessThan(createIdx);
    expect(createIdx).toBeLessThan(setNameIdx);
  });

  it('sends create_midi_track with -1 (append at end) and set/name with correct index+name', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 2]);

    await mock.createLyricsTrack('Vocals +LYRICS');

    const createCall = mock.sent.find((s) => s.address === '/live/song/create_midi_track');
    expect(createCall).toBeDefined();
    expect(createCall!.args).toEqual([-1]);

    const setNameCall = mock.sent.find((s) => s.address === '/live/track/set/name');
    expect(setNameCall).toBeDefined();
    expect(setNameCall!.args).toEqual([2, 'Vocals +LYRICS']);
  });

  it('handles zero existing tracks (new track gets index 0)', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/num_tracks', ['/live/song/get/num_tracks', 0]);

    const result = await mock.createLyricsTrack('Lyrics +LYRICS');
    expect(result).toEqual({ index: 0, name: 'Lyrics +LYRICS' });

    const setNameCall = mock.sent.find((s) => s.address === '/live/track/set/name');
    expect(setNameCall!.args).toEqual([0, 'Lyrics +LYRICS']);
  });
});

// ---------------------------------------------------------------------------
// getSongProjectPath (LS-B)
// ---------------------------------------------------------------------------

describe('OscClient.getSongProjectPath', () => {
  it('returns the project path string from the reply', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/project_path', [
      '/live/song/get/project_path',
      '/Users/ajhochy/Music/Ableton/Great Things Project',
    ]);

    const result = await mock.getSongProjectPath();
    expect(result).toBe('/Users/ajhochy/Music/Ableton/Great Things Project');
    expect(mock.sent[0].address).toBe('/live/song/get/project_path');
  });

  it('returns "" when the reply contains an empty string (unsaved set)', async () => {
    const mock = makeMock();
    mock.queueReply('/live/song/get/project_path', ['/live/song/get/project_path', '']);

    const result = await mock.getSongProjectPath();
    expect(result).toBe('');
  });

  it('rejects on timeout (no reply)', async () => {
    const mock = makeMock();
    // No reply queued — should time out.
    const origRequest = (mock as unknown as {
      _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
    })._request.bind(mock);

    vi.spyOn(
      mock as unknown as {
        _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
      },
      '_request',
    ).mockImplementation((addr, args, replyAddr, _timeout) =>
      origRequest(addr, args, replyAddr, 10), // 10 ms for speed
    );

    await expect(mock.getSongProjectPath()).rejects.toThrow(/timeout/i);
  });
});

// ---------------------------------------------------------------------------
// probeHandler
// ---------------------------------------------------------------------------

describe('OscClient.probeHandler', () => {
  it('returns true when a reply arrives for the version address', async () => {
    const mock = makeMock();
    mock.queueReply(
      '/live/track/arrangement_writer_version',
      ['/live/track/arrangement_writer_version', '1.0.0'],
    );

    const result = await mock.probeHandler();
    expect(result).toBe(true);
  });

  it('returns false on timeout (no reply)', async () => {
    const mock = makeMock();
    // No reply queued → should time out and return false
    // The PROBE_TIMEOUT_MS is 600 ms; we rely on the internal timeout.
    // Wrap _request to use a very short timeout for speed.
    const origRequest = (mock as unknown as {
      _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
    })._request.bind(mock);

    vi.spyOn(
      mock as unknown as {
        _request: (addr: string, args: unknown[], replyAddr: string, timeout?: number) => Promise<unknown[]>;
      },
      '_request',
    ).mockImplementation((addr, args, replyAddr, _timeout) =>
      origRequest(addr, args, replyAddr, 10),
    );

    const result = await mock.probeHandler();
    expect(result).toBe(false);
  });
});
