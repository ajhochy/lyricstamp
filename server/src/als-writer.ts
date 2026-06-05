/**
 * als-writer.ts
 *
 * Builds a gzipped Ableton Live 12 .als file by injecting MidiClip elements
 * into the blank-stamp-track.als template.
 *
 * Reference MidiClip XML structure (Ableton Live 12 / SchemaVersion 3):
 * -----------------------------------------------------------------------
 * <MidiClip Id="0" Time="{beats}">
 *   <LomId Value="0" />
 *   <LomIdView Value="0" />
 *   <CurrentStart Value="{beats}" />
 *   <CurrentEnd Value="{beats + 0.25}" />
 *   <Loop>
 *     <LoopStart Value="0" />
 *     <LoopEnd Value="0.25" />
 *     <StartRelative Value="0" />
 *     <LoopOn Value="false" />
 *     <OutMarker Value="0.25" />
 *     <HiddenLoopStart Value="0" />
 *     <HiddenLoopEnd Value="0.25" />
 *   </Loop>
 *   <Name Value="{clipName}" />
 *   <Annotation Value="" />
 *   <Color Value="4" />
 *   <LaunchMode Value="0" />
 *   <LaunchQuantisation Value="0" />
 *   <TimeSignature>
 *     <TimeSignatures>
 *       <RemoteableTimeSignature Id="0">
 *         <Numerator Value="4" />
 *         <Denominator Value="4" />
 *         <Time Value="0" />
 *       </RemoteableTimeSignature>
 *     </TimeSignatures>
 *   </TimeSignature>
 *   <Envelopes>
 *     <Envelopes />
 *   </Envelopes>
 *   <ScrollerTimePreserver>
 *     <LeftTime Value="0" />
 *     <RightTime Value="0.25" />
 *   </ScrollerTimePreserver>
 *   <TimeSelection>
 *     <AnchorTime Value="0" />
 *     <OtherTime Value="0" />
 *   </TimeSelection>
 *   <Legato Value="false" />
 *   <Ram Value="false" />
 *   <GrooveSettings>
 *     <GrooveId Value="-1" />
 *   </GrooveSettings>
 *   <Disabled Value="false" />
 *   <VelocityAmount Value="0" />
 *   <FollowAction>
 *     <FollowTime Value="4" />
 *     <IsLinked Value="true" />
 *     <LoopIterations Value="1" />
 *     <FollowActionA Value="4" />
 *     <FollowActionB Value="0" />
 *     <FollowChanceA Value="100" />
 *     <FollowChanceB Value="0" />
 *     <JumpIndexA Value="1" />
 *     <JumpIndexB Value="1" />
 *     <FollowActionEnabled Value="false" />
 *   </FollowAction>
 *   <Grid>
 *     <FixedNumerator Value="1" />
 *     <FixedDenominator Value="16" />
 *     <GridIntervalPixel Value="20" />
 *     <Ntoles Value="2" />
 *     <SnapToGrid Value="true" />
 *     <Fixed Value="false" />
 *   </Grid>
 *   <FreezeStart Value="0" />
 *   <FreezeEnd Value="0" />
 *   <IsWarped Value="true" />
 *   <TakeId Value="1" />
 *   <Notes>
 *     <KeyTracks>
 *       <KeyTrack Id="0">
 *         <Notes>
 *           <MidiNoteEvent Time="0" Duration="0.25" Velocity="100" OffVelocity="64" IsEnabled="true" />
 *         </Notes>
 *         <MidiKey Value="60" />
 *       </KeyTrack>
 *     </KeyTracks>
 *     <PerNoteEventStore>
 *       <EventLists />
 *     </PerNoteEventStore>
 *     <NoteIdGenerator>
 *       <NextId Value="2" />
 *     </NoteIdGenerator>
 *   </Notes>
 *   <BankSelectCoarse Value="-1" />
 *   <BankSelectFine Value="-1" />
 *   <ProgramChange Value="-1" />
 *   <NoteEditorFoldInZoom Value="-1" />
 *   <NoteEditorFoldInScroll Value="-1" />
 *   <NoteEditorFoldOutZoom Value="905" />
 *   <NoteEditorFoldOutScroll Value="-389" />
 * </MidiClip>
 * -----------------------------------------------------------------------
 */

import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve the template path lazily at call time, not at module-init time.
// In the packaged Electron app, process.cwd() is '/' and ELECTRON_APP_ROOT
// is set by electron/main.ts inside app.whenReady() — which fires AFTER the
// module graph is imported. A module-level constant would always see the
// unset value. Calling this function at export-time gets the correct value.
function getTemplatePath(): string {
  return resolve(
    process.env.ELECTRON_APP_ROOT ?? process.cwd(),
    'templates/blank-stamp-track.als',
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AlsStampInput = {
  ts: number; // beats — AbletonOSC /live/song/get/current_song_time returns beats, not seconds
  clipName: string; // already-formatted name
};

// The two MIDI tracks present in blank-stamp-track.als (Live 12), in order.
//   'chart'     → template EffectiveName "Chart +LYRICS [-2n]"   (lyric clips)
//   'leadsheet' → template EffectiveName "leadsheet +LYRICS [-2n]" (page-image clips)
export type AlsTemplateTrack = 'chart' | 'leadsheet';

const TEMPLATE_TRACK_NAME: Record<AlsTemplateTrack, string> = {
  chart: 'Chart +LYRICS [-2n]',
  leadsheet: 'leadsheet +LYRICS [-2n]',
};

export type AlsTrackSpec = {
  track: AlsTemplateTrack; // which template track to populate
  name: string; // new EffectiveName for the track
  stamps: AlsStampInput[]; // clips to inject (beats)
};

/**
 * Build a gzipped .als Buffer from the blank-stamp-track template.
 *
 * Two call styles:
 *   - Legacy single track: { trackName, stamps } → populates the "chart" track.
 *   - Multi-track:         { tracks: AlsTrackSpec[] } → populates each named
 *     template track independently (e.g. lyrics on "chart" + images on
 *     "leadsheet"). Each track's clips are injected into THAT track's own
 *     ArrangerAutomation/Events, scoped per MidiTrack block.
 *
 * `bpm` is accepted for API stability but unused — ts is already in beats.
 */
export function writeAlsFile(opts: {
  bpm?: number;
  trackName?: string;
  stamps?: AlsStampInput[];
  tracks?: AlsTrackSpec[];
}): Buffer {
  const specs: AlsTrackSpec[] = opts.tracks
    ? opts.tracks
    : [{ track: 'chart', name: opts.trackName ?? 'Chart +LYRICS [-2n]', stamps: opts.stamps ?? [] }];

  const templateBytes = readFileSync(getTemplatePath());
  let xml = gunzipSync(templateBytes).toString('utf-8');

  // Split the document at the two MidiTrack boundaries so each track's clips
  // land in its own block (the first <ArrangerAutomation>…<Events/> within the
  // block is that track's arrangement clip container).
  const starts = [...xml.matchAll(/<MidiTrack Id="\d+"/g)].map((m) => m.index ?? -1);
  if (starts.length < 2) {
    throw new Error(`Expected 2 MIDI tracks in template, found ${starts.length}`);
  }
  const prefix = xml.slice(0, starts[0]);
  let chartSeg = xml.slice(starts[0], starts[1]); // track 0 = chart
  let restSeg = xml.slice(starts[1]); // track 1 = leadsheet + document tail

  // Number clip ids contiguously across tracks so no two clips share an Id.
  let idBase = 0;
  for (const spec of specs) {
    if (spec.track === 'chart') {
      chartSeg = applyTrack(chartSeg, spec, idBase);
    } else {
      restSeg = applyTrack(restSeg, spec, idBase);
    }
    idBase += spec.stamps.length;
  }

  xml = prefix + chartSeg + restSeg;
  return gzipSync(Buffer.from(xml, 'utf-8'), { level: 9 });
}

/**
 * Within a single MidiTrack segment, rename its EffectiveName and inject clips
 * into its first (arrangement) Events element. Operates on the first match in
 * the segment, which is safe because the segment contains exactly one track.
 */
function applyTrack(segment: string, spec: AlsTrackSpec, idBase: number): string {
  let out = segment;

  // Rename the template EffectiveName for this track (first match in segment).
  const fromName = TEMPLATE_TRACK_NAME[spec.track];
  out = out.replace(
    new RegExp(`<EffectiveName Value="${escapeRegExp(fromName)}" />`),
    `<EffectiveName Value="${escapeXml(spec.name)}" />`,
  );

  if (spec.stamps.length > 0) {
    const beats = spec.stamps.map((s) => s.ts);
    const clipXml = spec.stamps
      .map((stamp, idx) => {
        const start = beats[idx];
        const end = idx < spec.stamps.length - 1 ? beats[idx + 1] : start + DEFAULT_CLIP_LENGTH;
        return buildMidiClipXml(idBase + idx, start, end, stamp.clipName);
      })
      .join('\n\t\t\t\t\t');
    out = out.replace(
      /(<ArrangerAutomation>[\s\S]*?<Events) \/>/,
      `$1>\n\t\t\t\t\t\t${clipXml}\n\t\t\t\t\t\t</Events>`,
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape a literal string for safe use inside a RegExp. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape XML special characters in attribute values. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a beat value as a string with up to 6 decimal places, trimming trailing zeros. */
function beatStr(beats: number): string {
  // Use a fixed precision but trim trailing zeros for cleanliness.
  // Avoid floating-point noise by rounding to 6 decimal places.
  return parseFloat(beats.toFixed(6)).toString();
}

export const DEFAULT_CLIP_LENGTH = 4; // beats — fallback for the last clip when no next stamp

/**
 * Build a single MidiClip XML snippet for insertion into ArrangerAutomation > Events.
 * The clip extends from `startBeats` to `endBeats` with one C3 (pitch 60) MIDI note.
 */
function buildMidiClipXml(
  id: number,
  startBeats: number,
  endBeats: number,
  clipName: string,
): string {
  const start = beatStr(startBeats);
  const end = beatStr(endBeats);
  const length = endBeats - startBeats;
  const name = escapeXml(clipName);

  return [
    `<MidiClip Id="${id}" Time="${start}">`,
    `\t<LomId Value="0" />`,
    `\t<LomIdView Value="0" />`,
    `\t<CurrentStart Value="${start}" />`,
    `\t<CurrentEnd Value="${end}" />`,
    `\t<Loop>`,
    `\t\t<LoopStart Value="0" />`,
    `\t\t<LoopEnd Value="${length}" />`,
    `\t\t<StartRelative Value="0" />`,
    `\t\t<LoopOn Value="false" />`,
    `\t\t<OutMarker Value="${length}" />`,
    `\t\t<HiddenLoopStart Value="0" />`,
    `\t\t<HiddenLoopEnd Value="${length}" />`,
    `\t</Loop>`,
    `\t<Name Value="${name}" />`,
    `\t<Annotation Value="0" />`,
    `\t<Color Value="4" />`,
    `\t<LaunchMode Value="0" />`,
    `\t<LaunchQuantisation Value="0" />`,
    `\t<TimeSignature>`,
    `\t\t<TimeSignatures>`,
    `\t\t\t<RemoteableTimeSignature Id="0">`,
    `\t\t\t\t<Numerator Value="4" />`,
    `\t\t\t\t<Denominator Value="4" />`,
    `\t\t\t\t<Time Value="0" />`,
    `\t\t\t</RemoteableTimeSignature>`,
    `\t\t</TimeSignatures>`,
    `\t</TimeSignature>`,
    `\t<Envelopes>`,
    `\t\t<Envelopes />`,
    `\t</Envelopes>`,
    `\t<ScrollerTimePreserver>`,
    `\t\t<LeftTime Value="0" />`,
    `\t\t<RightTime Value="${length}" />`,
    `\t</ScrollerTimePreserver>`,
    `\t<TimeSelection>`,
    `\t\t<AnchorTime Value="0" />`,
    `\t\t<OtherTime Value="0" />`,
    `\t</TimeSelection>`,
    `\t<Legato Value="false" />`,
    `\t<Ram Value="false" />`,
    `\t<GrooveSettings>`,
    `\t\t<GrooveId Value="-1" />`,
    `\t</GrooveSettings>`,
    `\t<Disabled Value="false" />`,
    `\t<VelocityAmount Value="0" />`,
    `\t<FollowAction>`,
    `\t\t<FollowTime Value="4" />`,
    `\t\t<IsLinked Value="true" />`,
    `\t\t<LoopIterations Value="1" />`,
    `\t\t<FollowActionA Value="4" />`,
    `\t\t<FollowActionB Value="0" />`,
    `\t\t<FollowChanceA Value="100" />`,
    `\t\t<FollowChanceB Value="0" />`,
    `\t\t<JumpIndexA Value="1" />`,
    `\t\t<JumpIndexB Value="1" />`,
    `\t\t<FollowActionEnabled Value="false" />`,
    `\t</FollowAction>`,
    `\t<Grid>`,
    `\t\t<FixedNumerator Value="1" />`,
    `\t\t<FixedDenominator Value="16" />`,
    `\t\t<GridIntervalPixel Value="20" />`,
    `\t\t<Ntoles Value="2" />`,
    `\t\t<SnapToGrid Value="true" />`,
    `\t\t<Fixed Value="false" />`,
    `\t</Grid>`,
    `\t<FreezeStart Value="0" />`,
    `\t<FreezeEnd Value="0" />`,
    `\t<IsWarped Value="true" />`,
    `\t<TakeId Value="${id + 1}" />`,
    `\t<Notes>`,
    `\t\t<KeyTracks>`,
    `\t\t\t<KeyTrack Id="0">`,
    `\t\t\t\t<Notes>`,
    `\t\t\t\t\t<MidiNoteEvent Time="0" Duration="${length}" Velocity="100" OffVelocity="64" IsEnabled="true" />`,
    `\t\t\t\t</Notes>`,
    `\t\t\t\t<MidiKey Value="60" />`,
    `\t\t\t</KeyTrack>`,
    `\t\t</KeyTracks>`,
    `\t\t<PerNoteEventStore>`,
    `\t\t\t<EventLists />`,
    `\t\t</PerNoteEventStore>`,
    `\t\t<NoteIdGenerator>`,
    `\t\t\t<NextId Value="2" />`,
    `\t\t</NoteIdGenerator>`,
    `\t</Notes>`,
    `\t<BankSelectCoarse Value="-1" />`,
    `\t<BankSelectFine Value="-1" />`,
    `\t<ProgramChange Value="-1" />`,
    `\t<NoteEditorFoldInZoom Value="-1" />`,
    `\t<NoteEditorFoldInScroll Value="-1" />`,
    `\t<NoteEditorFoldOutZoom Value="905" />`,
    `\t<NoteEditorFoldOutScroll Value="-389" />`,
    `</MidiClip>`,
  ].join('\n\t\t\t\t\t\t');
}
