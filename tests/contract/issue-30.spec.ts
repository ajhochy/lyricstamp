// CONTRACT TEST — issue #30: spacebar pause-in-place.
//
// The true playhead-retention behavior (c1/c2/c3) is an Ableton Live runtime
// property and is verified in manual smoke (see docs/ai/contracts/issue-30.json
// not_tested). What IS headlessly verifiable, and what these tests pin, is the
// OSC command mapping that produces it:
//   - pausePlaying()    -> /live/song/stop_playing  (Live does NOT rewind on stop)
//   - continuePlaying() -> /live/song/continue_playing (resume from position)
//   - returnToStart()   -> stop_playing + set/current_song_time 0 (the explicit
//     "play from beginning" control required by c4)
//
// The OSC fire-and-forget path uses the private _oscClient.send(address, ...);
// we inject a recording fake to capture the address sequence with no socket.

import { describe, it, expect } from 'vitest';
import { OscClient } from '../../server/src/osc-client.js';

type SendCall = { address: string; args: unknown[] };

function makeRecordingClient(): { client: OscClient; sent: SendCall[] } {
  const sent: SendCall[] = [];
  const fakeOsc = {
    send: (address: string, ...rest: unknown[]) => {
      // Trailing arg is the node-osc callback; record the numeric/string args only.
      const args = rest.filter((a) => typeof a !== 'function');
      sent.push({ address, args });
    },
    close: () => {},
    on: () => {},
  };
  const client = new OscClient();
  // Inject the recording fake in place of the real node-osc Client.
  (client as unknown as { _oscClient: unknown })._oscClient = fakeOsc;
  return { client, sent };
}

describe('issue-30-c5: OSC pause/resume mapping is pause-in-place', () => {
  it('pausePlaying sends stop_playing (no rewind) and NOT set/current_song_time', () => {
    const { client, sent } = makeRecordingClient();
    client.pausePlaying();
    const addrs = sent.map((s) => s.address);
    expect(addrs).toContain('/live/song/stop_playing');
    // Must NOT pin the playhead — pinning broke Ableton-driven resets (see
    // osc-client.ts pausePlaying doc). So no set/current_song_time on pause.
    expect(addrs).not.toContain('/live/song/set/current_song_time');
    // Must NOT rewind via start_playing.
    expect(addrs).not.toContain('/live/song/start_playing');
  });

  it('continuePlaying resumes via continue_playing, never start_playing', () => {
    const { client, sent } = makeRecordingClient();
    client.continuePlaying();
    const addrs = sent.map((s) => s.address);
    expect(addrs).toEqual(['/live/song/continue_playing']);
    expect(addrs).not.toContain('/live/song/start_playing');
  });
});

describe('issue-30-c4: explicit return-to-start control exists and rewinds', () => {
  it('returnToStart stops and sets the playhead to beat 0', () => {
    const { client, sent } = makeRecordingClient();
    client.returnToStart();
    const addrs = sent.map((s) => s.address);
    expect(addrs).toContain('/live/song/stop_playing');
    const setTime = sent.find((s) => s.address === '/live/song/set/current_song_time');
    expect(setTime).toBeTruthy();
    expect(setTime!.args[0]).toBe(0);
    // Order matters: Ableton snapshots the playhead as the continue_playing resume
    // point when it processes stop_playing — seek must arrive first so Ableton
    // saves 0 as the resume point, not the pre-stop position.
    const setIdx = sent.findIndex((s) => s.address === '/live/song/set/current_song_time');
    const stopIdx = sent.findIndex((s) => s.address === '/live/song/stop_playing');
    expect(setIdx).toBeLessThan(stopIdx);
  });
});
