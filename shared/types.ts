export type LyricStamp = {
  id: string;
  lineIdx: number;
  lineText: string;
  section: string | null;
  ts: number;
  beats: number;
};

export type SheetStamp = {
  id: string;
  page: number;
  region: string;
  imageRef: string;
  pngDataUrl: string;
  ts: number;
};

export type Song = {
  name: string;
  bpm: number;
  key: string;
  lines: Array<{ section?: string; text?: string }>;
};

export type HandlerStatus = 'present' | 'absent' | 'unknown';

export type LiveMsg =
  | { type: 'tick'; ts: number; bpm: number; playing: boolean; numerator: number; denominator: number; handlerStatus: HandlerStatus }
  | { type: 'connection'; connected: boolean }
  | { type: 'song'; bpm: number; tempo: number; signature: string };

// Transport actions:
//   play  — resume from the current playhead (continue_playing)
//   pause — stop playback, leave the playhead where it is (stop_playing)
//   stop  — stop AND return the playhead to the start (stop_playing + seek 0)
//   seek  — move the playhead to `ts` (beats) without changing play state
export type ClientMsg =
  | { type: 'transport'; action: 'play' | 'pause' | 'stop' }
  | { type: 'transport'; action: 'seek'; ts: number };

/** Filesystem-derived status of the AbletonOSC remote-script install. */
export interface RemoteScriptStatus {
  installed: boolean;              // dest AbletonOSC folder exists
  installedVersion: string | null; // ABLESET_FORK_VERSION read from dest
  bundledVersion: string | null;   // ABLESET_FORK_VERSION read from bundled source
  upToDate: boolean;               // installed && installedVersion === bundledVersion
  userLibFound: boolean;           // resolved Ableton User Library dir exists
  sourceFound: boolean;            // bundled fork source exists (false => corrupt install)
  destPath: string;                // absolute <userLib>/Remote Scripts/AbletonOSC
}
