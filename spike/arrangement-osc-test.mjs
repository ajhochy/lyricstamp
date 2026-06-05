// SPIKE: prove a named clip can be placed into the live Ableton ARRANGEMENT at a
// beat position via the patched AbletonOSC handler /live/track/duplicate_clip_to_arrangement.
// Throwaway — not part of the app. Run from repo root so node-osc resolves.
//
//   node spike/arrangement-osc-test.mjs
//
// Requires: Ableton open with the PATCHED AbletonOSC loaded (restart Live first),
// and port 11001 free (quit the AbleSet Sync app).

import { Client, Server } from 'node-osc';

const SEND_HOST = '127.0.0.1';
const SEND_PORT = 11000;   // AbletonOSC listens here
const RECV_PORT = 11001;   // AbletonOSC replies here

const client = new Client(SEND_HOST, SEND_PORT);
const server = new Server(RECV_PORT, '127.0.0.1');

const waiters = [];
server.on('message', (msg) => {
  const [address, ...args] = msg;
  console.log('  ← reply', address, JSON.stringify(args));
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].address === address) { waiters[i].resolve(args); waiters.splice(i, 1); }
  }
});

function send(address, ...args) {
  console.log('  → send ', address, JSON.stringify(args));
  return new Promise((res) => client.send(address, ...args, () => res()));
}
function request(address, replyAddress, ...args) {
  return new Promise(async (resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${replyAddress}`)), 4000);
    waiters.push({ address: replyAddress, resolve: (a) => { clearTimeout(t); resolve(a); } });
    await send(address, ...args);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LYRIC = 'SPIKE — Amazing grace';
const BEAT = 8.0;

(async () => {
  try {
    // 0. Sanity: is AbletonOSC alive?
    console.log('\n[0] ping /live/test');
    await request('/live/test', '/live/test').catch(() => console.log('  (no /live/test reply — continuing)'));

    // 1. Create a MIDI track at the end; reply carries the new track index.
    console.log('\n[1] create MIDI track');
    const created = await request('/live/song/create_midi_track', '/live/song/create_midi_track', -1);
    const trackIndex = Number(created[0]);
    console.log('    new track index =', trackIndex);
    await sleep(200);

    // 2. Mark it as an AbleSet lyrics track so AbleSet would read its clips.
    console.log('\n[2] name the track +LYRICS');
    await send('/live/track/set/name', trackIndex, 'SPIKE +LYRICS [-2n]');
    await sleep(150);

    // 3. Create a session clip in slot 0 and name it the lyric.
    console.log('\n[3] create session clip + name it');
    await send('/live/clip_slot/create_clip', trackIndex, 0, 4.0);
    await sleep(150);
    await send('/live/clip/set/name', trackIndex, 0, LYRIC);
    await sleep(150);

    // 4. THE TEST: duplicate that named clip into the ARRANGEMENT at BEAT.
    console.log(`\n[4] duplicate_clip_to_arrangement → beat ${BEAT}`);
    await request('/live/track/duplicate_clip_to_arrangement',
                  '/live/track/duplicate_clip_to_arrangement', trackIndex, 0, BEAT);
    await sleep(300);

    // 5. Read back the arrangement clips on that track.
    console.log('\n[5] read back arrangement clips');
    const names = await request('/live/track/get/arrangement_clips/name',
                                '/live/track/get/arrangement_clips/name', trackIndex);
    const starts = await request('/live/track/get/arrangement_clips/start_time',
                                 '/live/track/get/arrangement_clips/start_time', trackIndex);

    console.log('\n==================== RESULT ====================');
    console.log('arrangement clip names :', JSON.stringify(names));
    console.log('arrangement start_times:', JSON.stringify(starts));
    const ok = names.some((n) => String(n).includes('Amazing grace'));
    console.log(ok
      ? `✅ PASS — named clip is in the ARRANGEMENT (expected near beat ${BEAT}).`
      : '❌ FAIL — no matching arrangement clip found.');
    console.log('===============================================');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error('   (If timeout on duplicate_clip_to_arrangement: Live likely still has the UNPATCHED script — restart Live.)');
  } finally {
    await sleep(200);
    server.close();
    client.close?.();
    process.exit(0);
  }
})();
