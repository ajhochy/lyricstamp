import { EventEmitter } from 'node:events';
import { Client, Server } from 'node-osc';

// ---------------------------------------------------------------------------
// Injectable transport seam for unit testing
// ---------------------------------------------------------------------------

/** Signature of the raw OSC send function (mirrors node-osc's Client.send). */
export type OscSendFn = (address: string, ...args: unknown[]) => void;

/**
 * Register a one-shot reply handler.  The handler is called the next time a
 * message whose address matches `replyAddress` arrives, then removed.
 * Returns an unregister function so callers can cancel on timeout.
 */
export type OscReplyRegisterFn = (
  replyAddress: string,
  handler: (msg: unknown[]) => void,
) => () => void;

export interface TickPayload {
  ts: number;
  bpm: number;
  playing: boolean;
  numerator: number;
  denominator: number;
}

export interface ConnectionPayload {
  connected: boolean;
}

const OSC_SEND_PORT = 11000;
const OSC_RECV_PORT = 11001;
const OSC_HOST = '127.0.0.1';

const POLL_INTERVAL_MS = 100; // 10 Hz
const HEARTBEAT_INTERVAL_MS = 1000; // 1 Hz
const HEARTBEAT_TIMEOUT_MS = 2000; // 2 s

// Arrangement-write addresses (Issue B)
const ADDR_NUM_TRACKS = '/live/song/get/num_tracks';
const ADDR_TRACK_NAME = '/live/track/get/name';
const ADDR_CREATE_CLIP = '/live/clip_slot/create_clip';
const ADDR_SET_CLIP_NAME = '/live/clip/set/name';
const ADDR_DUPLICATE_CLIP = '/live/track/duplicate_clip_to_arrangement';
const ADDR_DELETE_CLIP = '/live/clip_slot/delete_clip';
const ADDR_HANDLER_VERSION = '/live/track/arrangement_writer_version';

const REPLY_TIMEOUT_MS = 2000; // 2 s default reply timeout
const PROBE_TIMEOUT_MS = 600;  // 600 ms for handler probe

const ADDR_SONG_TIME = '/live/song/get/current_song_time';
const ADDR_TEMPO = '/live/song/get/tempo';
const ADDR_IS_PLAYING = '/live/song/get/is_playing';
const ADDR_SIG_NUM = '/live/song/get/signature_numerator';
const ADDR_SIG_DEN = '/live/song/get/signature_denominator';
const ADDR_TEST = '/live/test';
const ADDR_START_PLAYING = '/live/song/start_playing';
const ADDR_STOP_PLAYING = '/live/song/stop_playing';
const ADDR_CONTINUE_PLAYING = '/live/song/continue_playing';
const ADDR_SET_SONG_TIME = '/live/song/set/current_song_time';

type OscClientEvents = {
  tick: [TickPayload];
  connection: [ConnectionPayload];
};

export class OscClient extends EventEmitter<OscClientEvents> {
  private _oscClient: Client | null = null;
  private _oscServer: Server | null = null;

  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private _lastTs: number | null = null;
  private _lastBpm: number | null = null;
  private _lastPlaying: boolean | null = null;
  // Time signature defaults to 4/4 until Ableton reports otherwise.
  private _lastNum = 4;
  private _lastDen = 4;

  private _lastHeartbeatReplyAt = 0;
  private _connected = false;
  private _started = false;

  // One-shot reply handlers registered by address (for request/reply pattern)
  private _replyHandlers = new Map<string, ((msg: unknown[]) => void)[]>();

  start(): void {
    if (this._started) {
      return;
    }
    this._started = true;

    // Open the receive server first so replies are captured
    this._oscServer = new Server(OSC_RECV_PORT, OSC_HOST, () => {
      console.log(`[OSC] Listening on ${OSC_HOST}:${OSC_RECV_PORT}`);
    });

    this._oscServer.on('message', (msg: unknown[]) => {
      this._handleMessage(msg);
    });

    this._oscServer.on('error', (err: Error) => {
      console.error('[OSC] Server error:', err.message);
    });

    // Open the send client
    this._oscClient = new Client(OSC_HOST, OSC_SEND_PORT);

    this._oscClient.on('error', (err: Error) => {
      console.error('[OSC] Client error:', err.message);
    });

    // Start poll loop at 10 Hz
    this._pollTimer = setInterval(() => {
      this._poll();
    }, POLL_INTERVAL_MS);

    // Start heartbeat loop at 1 Hz
    this._heartbeatTimer = setInterval(() => {
      this._heartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Kick off an immediate heartbeat
    this._heartbeat();
  }

  stop(): void {
    if (!this._started) {
      return;
    }
    this._started = false;

    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    if (this._oscClient !== null) {
      this._oscClient.close();
      this._oscClient = null;
    }

    if (this._oscServer !== null) {
      this._oscServer.close();
      this._oscServer = null;
    }
  }

  startPlaying(): void {
    this._send(ADDR_START_PLAYING);
  }

  stopPlaying(): void {
    this._send(ADDR_STOP_PLAYING);
  }

  /**
   * Pause in place: stop_playing leaves the Live playhead where it is — it does
   * NOT rewind to the start (only start_playing rewinds, which is why resume
   * uses continue_playing below).
   *
   * We deliberately do NOT pin the position with set/current_song_time here.
   * Pinning froze Live's continue-point at the pause position, which made it
   * impossible to return to zero from Ableton (the Stop button / dragging the
   * playhead). Leaving current_song_time untouched lets Ableton drive resets:
   * after an Ableton Stop, continue_playing resumes from wherever Live now is.
   */
  pausePlaying(): void {
    this._send(ADDR_STOP_PLAYING);
  }

  /**
   * Resume from Live's current position using continue_playing, which does not
   * rewind to the start the way start_playing does.
   */
  continuePlaying(): void {
    this._send(ADDR_CONTINUE_PLAYING);
  }

  /**
   * Stop and return the playhead to the start (beat 0).
   *
   * We set current_song_time explicitly rather than relying on Ableton's Stop
   * button: continue_playing resumes from current_song_time, and that value
   * does not always track the visible playhead when repositioned manually.
   * Setting it here guarantees the next play starts from 0.
   */
  returnToStart(): void {
    this._send(ADDR_STOP_PLAYING);
    this._sendWithValue(ADDR_SET_SONG_TIME, 0);
  }

  /**
   * Move the playhead to a specific position (in beats) without starting or
   * stopping playback. If Live is playing, it jumps and keeps playing; if
   * stopped, the next continue_playing resumes from here.
   */
  seek(beats: number): void {
    this._sendWithValue(ADDR_SET_SONG_TIME, Math.max(0, beats));
  }

  /** Whether the OSC connection to Ableton is currently active. */
  get connected(): boolean {
    return this._connected;
  }

  // ---------------------------------------------------------------------------
  // Injectable send+reply seam (allows unit tests to mock the OSC transport)
  // ---------------------------------------------------------------------------

  /**
   * Send an OSC message with optional arguments.
   * Exposed so tests can replace the seam via a subclass override.
   */
  protected _oscSend(address: string, ...args: unknown[]): void {
    if (this._oscClient === null) {
      return;
    }
    // node-osc's send() accepts a callback as the last arg when there are
    // additional args; we always append an error-logging callback.
    (this._oscClient as unknown as { send: (...a: unknown[]) => void }).send(
      address,
      ...args,
      (err?: Error) => {
        if (err) {
          console.error(`[OSC] Send error for ${address}:`, err.message);
        }
      },
    );
  }

  /**
   * Register a one-shot reply handler for `replyAddress`.
   * Returns an unregister function.
   */
  protected _registerReply(
    replyAddress: string,
    handler: (msg: unknown[]) => void,
  ): () => void {
    const handlers = this._replyHandlers.get(replyAddress) ?? [];
    handlers.push(handler);
    this._replyHandlers.set(replyAddress, handlers);

    return () => {
      const h = this._replyHandlers.get(replyAddress);
      if (!h) return;
      const idx = h.indexOf(handler);
      if (idx !== -1) h.splice(idx, 1);
      if (h.length === 0) this._replyHandlers.delete(replyAddress);
    };
  }

  /**
   * Send an OSC request and wait for the first reply on `replyAddress`.
   * Rejects after `timeoutMs` milliseconds.
   */
  private _request(
    address: string,
    args: unknown[],
    replyAddress: string,
    timeoutMs = REPLY_TIMEOUT_MS,
  ): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const unregister = this._registerReply(replyAddress, (msg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(msg);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unregister();
        reject(new Error(`OSC timeout waiting for ${replyAddress}`));
      }, timeoutMs);

      this._oscSend(address, ...args);
    });
  }

  // ---------------------------------------------------------------------------
  // Issue B — high-level arrangement-write methods
  // ---------------------------------------------------------------------------

  /**
   * List all tracks in the current Ableton session.
   * Queries `/live/song/get/num_tracks` then `/live/track/get/name` for each.
   */
  async listTracks(): Promise<{ index: number; name: string }[]> {
    const numReply = await this._request(
      ADDR_NUM_TRACKS,
      [],
      ADDR_NUM_TRACKS,
    );
    const count = numReply[1];
    if (typeof count !== 'number' || count <= 0) {
      return [];
    }

    const trackCount = Math.floor(count);
    const requests = Array.from({ length: trackCount }, (_, i) =>
      this._request(ADDR_TRACK_NAME, [i], ADDR_TRACK_NAME, REPLY_TIMEOUT_MS).then(
        (reply) => {
          const idx = reply[1];
          const name = reply[2];
          return {
            index: typeof idx === 'number' ? idx : i,
            name: typeof name === 'string' ? name : '',
          };
        },
      ),
    );

    const results = await Promise.all(requests);
    return results.sort((a, b) => a.index - b.index);
  }

  /**
   * Write a named clip to the Arrangement at `beat` on `trackIndex`.
   *
   * `length` (beats) sets the clip's duration so it spans to the next stamp —
   * AbleSet only shows a lyric while its clip is active on the timeline.
   *
   * Sequence (using scratch slot 0):
   *   1. create_clip(trackIndex, 0, length) — fire-and-forget
   *   2. set/name(trackIndex, 0, name)      — fire-and-forget
   *   3. duplicate_clip_to_arrangement(trackIndex, 0, beat) — await reply
   *   4. delete_clip(trackIndex, 0)         — fire-and-forget
   */
  async writeStampClip(
    trackIndex: number,
    name: string,
    beat: number,
    length = 1.0,
  ): Promise<void> {
    this._oscSend(ADDR_CREATE_CLIP, trackIndex, 0, length);
    this._oscSend(ADDR_SET_CLIP_NAME, trackIndex, 0, name);

    await this._request(
      ADDR_DUPLICATE_CLIP,
      [trackIndex, 0, beat],
      ADDR_DUPLICATE_CLIP,
    );

    // Fire-and-forget cleanup
    this._oscSend(ADDR_DELETE_CLIP, trackIndex, 0);
  }

  /**
   * Probe whether the fork's arrangement-writer handler is loaded.
   * Returns `true` if a reply arrives within PROBE_TIMEOUT_MS, `false` otherwise.
   */
  async probeHandler(): Promise<boolean> {
    try {
      await this._request(
        ADDR_HANDLER_VERSION,
        [],
        ADDR_HANDLER_VERSION,
        PROBE_TIMEOUT_MS,
      );
      return true;
    } catch {
      return false;
    }
  }

  private _sendWithValue(address: string, value: number): void {
    if (this._oscClient === null) {
      return;
    }
    this._oscClient.send(address, value, (err?: Error) => {
      if (err) {
        console.error(`[OSC] Send error for ${address}:`, err.message);
      }
    });
  }

  private _send(address: string): void {
    if (this._oscClient === null) {
      return;
    }
    this._oscClient.send(address, (err?: Error) => {
      if (err) {
        console.error(`[OSC] Send error for ${address}:`, err.message);
      }
    });
  }

  private _poll(): void {
    this._send(ADDR_SONG_TIME);
    this._send(ADDR_TEMPO);
    this._send(ADDR_IS_PLAYING);
    this._send(ADDR_SIG_NUM);
    this._send(ADDR_SIG_DEN);
  }

  private _heartbeat(): void {
    this._send(ADDR_TEST);
    // Check if the last reply was too long ago
    if (this._lastHeartbeatReplyAt > 0) {
      const elapsed = Date.now() - this._lastHeartbeatReplyAt;
      if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        this._setConnected(false);
      }
    }
  }

  private _handleMessage(msg: unknown[]): void {
    try {
      if (!Array.isArray(msg) || msg.length === 0) {
        return;
      }

      const address = msg[0] as string;

      // Dispatch to any waiting one-shot reply handlers
      const handlers = this._replyHandlers.get(address);
      if (handlers && handlers.length > 0) {
        const handler = handlers.shift()!;
        if (handlers.length === 0) this._replyHandlers.delete(address);
        handler(msg);
        // Don't return — a reply might also update local state (e.g. tempo)
      }

      if (address === ADDR_TEST) {
        this._lastHeartbeatReplyAt = Date.now();
        this._setConnected(true);
        return;
      }

      if (address === ADDR_SONG_TIME) {
        const val = msg[1];
        if (typeof val === 'number') {
          this._lastTs = val;
        }
      } else if (address === ADDR_TEMPO) {
        const val = msg[1];
        if (typeof val === 'number') {
          this._lastBpm = val;
        }
      } else if (address === ADDR_IS_PLAYING) {
        const val = msg[1];
        // AbletonOSC returns 1/0 or true/false
        if (typeof val === 'number') {
          this._lastPlaying = val !== 0;
        } else if (typeof val === 'boolean') {
          this._lastPlaying = val;
        }
      } else if (address === ADDR_SIG_NUM) {
        const val = msg[1];
        if (typeof val === 'number' && val > 0) this._lastNum = val;
      } else if (address === ADDR_SIG_DEN) {
        const val = msg[1];
        if (typeof val === 'number' && val > 0) this._lastDen = val;
      }

      // Emit tick once all three values have been received at least once
      if (
        this._lastTs !== null &&
        this._lastBpm !== null &&
        this._lastPlaying !== null
      ) {
        const payload: TickPayload = {
          ts: this._lastTs,
          bpm: this._lastBpm,
          playing: this._lastPlaying,
          numerator: this._lastNum,
          denominator: this._lastDen,
        };
        this.emit('tick', payload);
      }
    } catch (err) {
      console.error('[OSC] Error handling message:', err);
    }
  }

  private _setConnected(value: boolean): void {
    if (value !== this._connected) {
      this._connected = value;
      const payload: ConnectionPayload = { connected: value };
      this.emit('connection', payload);
      console.log(`[OSC] Connection state: ${value ? 'connected' : 'disconnected'}`);
    }
  }
}
