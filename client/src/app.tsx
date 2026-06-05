// app.tsx — AbleSet Sync main app component
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Icon } from './icons';
import { fmtBeats } from './format';
import { EMPTY_SONG, type InitialStamp } from './data';
import { usePdf } from './use-pdf';
import { LyricsView, LeadsheetView, TweaksUI, type StampRow, type LeadsheetStamp } from './views';
import { useTweaks, type Tweaks } from './use-tweaks';
import { usePersistentState } from './use-persistent-state';
import { savePdf, loadPdf, clearPdf } from './pdf-store';
import {
  listSessions,
  saveSession,
  getSession,
  deleteSession,
  type SessionMeta,
  type SessionState,
} from './session-store';
import { runSessionMigration } from './migrate-sessions';
import { useLive } from './use-live';
import type { Song } from '../../shared/types';

// ---------------------------------------------------------------------------
// Tweak defaults — must match Tweaks type from use-tweaks.ts.
// ---------------------------------------------------------------------------
/** Compact "saved at" label for the sessions list, e.g. "Jun 4, 7:12 PM". */
function fmtSavedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const TWEAK_DEFAULTS: Tweaks = {
  theme: 'dark',
  accent: 'teal',
  headerCompact: false,
  lyricSize: 'balanced',
  logDensity: 'tight',
  showSectionHeaders: true,
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  // ---- Tweaks ----
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // ---- App state ----
  // Session state (song, lyrics paste, stamps, cursor, active tab) persists to
  // localStorage so work survives app restarts. The app starts empty — paste
  // ChordPro and click "Reload song" to load a song.
  const [tab, setTab] = usePersistentState<'lyrics' | 'leadsheet'>('tab', 'lyrics');
  // Width (px) of the stamp-log side panel — user-resizable, persisted.
  const [logWidth, setLogWidth] = usePersistentState<number>('logWidth', 360);
  const [setupOpen, setSetupOpen] = useState<boolean>(false);
  const [song, setSong] = usePersistentState<Song>('song', EMPTY_SONG);
  const [songName, setSongName] = usePersistentState<string>('songName', '');
  const [pasteText, setPasteText] = usePersistentState<string>('pasteText', '');
  const [reloading, setReloading] = useState<boolean>(false);

  // Playback — driven by WebSocket (#17) and controlled via WebSocket (#18)
  const { state: liveState, sendCommand } = useLive();
  const { ts: time, bpm: liveBpm, playing: liveConnectedPlaying, connected, numerator, denominator, handlerStatus } = liveState;

  // Format a beat position as Bar.Beat.Sixteenth using the live time signature.
  const formatPos = useCallback(
    (beats: number) => fmtBeats(beats, numerator, denominator),
    [numerator, denominator],
  );
  // Optimistic local play state for the pill and hint bar.
  // Flips immediately on Space; the next tick (~100 ms) will confirm or correct.
  const [playing, setPlaying] = useState<boolean>(false);
  // Sync play state from live tick messages
  useEffect(() => {
    setPlaying(liveConnectedPlaying);
  }, [liveConnectedPlaying]);

  // Transport control — sends a command to Ableton over the WebSocket and
  // optimistically updates the local play indicator (the next OSC tick, ~100ms,
  // confirms or corrects it).
  const transport = useCallback(
    (action: 'play' | 'pause' | 'stop') => {
      sendCommand({ type: 'transport', action });
      setPlaying(action === 'play');
    },
    [sendCommand],
  );

  // Stamps
  const [stamps, setStamps] = usePersistentState<InitialStamp[]>('stamps', []);
  const [cursor, setCursor] = usePersistentState<number>('cursor', 0);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);

  // Seek the Ableton playhead to a stamp's position and move the lyric cursor
  // to that line so the preview follows. Wired to stamp-log row clicks.
  const seekToStamp = useCallback(
    (stampIndex: number) => {
      const s = stamps[stampIndex];
      if (!s) return;
      sendCommand({ type: 'transport', action: 'seek', ts: s.ts });
      setCursor(s.idx);
    },
    [stamps, sendCommand, setCursor],
  );

  // Keyboard pressed visual indicator
  const [pressed, setPressed] = useState<string | null>(null);

  // Toasts
  type Toast = { id: string; msg: string; meta?: string };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((msg: string, meta?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((arr) => [...arr, { id, msg, meta }]);
    setTimeout(() => setToasts((arr) => arr.filter((t) => t.id !== id)), 2400);
  }, []);

  // ---- Live track picker (issue E/F/G) ----
  // Persistent selected track index (null = nothing selected yet).
  const [liveTrackIndex, setLiveTrackIndex] = usePersistentState<number | null>('liveTrackIndex', null);
  // Track list fetched from Ableton when connected.
  const [liveTracks, setLiveTracks] = useState<{ index: number; name: string }[]>([]);
  const [applyingToAbleton, setApplyingToAbleton] = useState<boolean>(false);

  // Fetch track list from server whenever Ableton connects (connected flips to true).
  useEffect(() => {
    if (!connected) {
      setLiveTracks([]);
      return;
    }
    fetch('/api/live/tracks')
      .then((r) => (r.ok ? r.json() as Promise<{ index: number; name: string }[]> : Promise.resolve([])))
      .then((tracks) => setLiveTracks(tracks))
      .catch(() => setLiveTracks([]));
  }, [connected]);

  // Apply all proofed stamps to Ableton in a batch.
  const applyToAbleton = useCallback(async () => {
    if (!connected) {
      pushToast('Ableton not connected');
      return;
    }
    if (handlerStatus === 'absent') {
      pushToast('Remote script not loaded', 'Run npm run install:remote-script');
      return;
    }
    if (liveTrackIndex === null) {
      pushToast('Select a track first');
      return;
    }
    if (stamps.length === 0) {
      pushToast('No stamps to apply');
      return;
    }
    setApplyingToAbleton(true);
    try {
      const res = await fetch('/api/live/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIndex: liveTrackIndex, song, stamps }),
      });
      if (!res.ok) {
        let errMsg = 'Unknown error';
        try {
          const body = await res.json() as { error?: string };
          errMsg = body.error ?? errMsg;
        } catch { /* ignore */ }
        pushToast(`Apply failed: ${errMsg}`);
        return;
      }
      const result = await res.json() as { written: number; failed: { name: string; beat: number; error: string }[] };
      if (result.failed.length === 0) {
        pushToast(`Wrote ${result.written} clips`, `Track ${liveTrackIndex}`);
      } else {
        pushToast(
          `Wrote ${result.written}, failed ${result.failed.length}`,
          result.failed.map((f) => f.name).join(', '),
        );
      }
    } catch {
      pushToast('Apply failed: backend unreachable');
    } finally {
      setApplyingToAbleton(false);
    }
  }, [connected, handlerStatus, liveTrackIndex, stamps, song, pushToast]);

  // Reason why the Apply button is disabled (null = enabled).
  const applyDisabledReason = useMemo<string | null>(() => {
    if (!connected) return 'Ableton not connected';
    if (handlerStatus === 'absent') return 'Remote script not loaded';
    if (handlerStatus === 'unknown') return 'Checking remote script…';
    if (liveTrackIndex === null) return 'No track selected';
    if (stamps.length === 0) return 'No stamps to apply';
    return null;
  }, [connected, handlerStatus, liveTrackIndex, stamps.length]);

  // Leadsheet
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pageRenderer = usePdf(pdfFile);
  // Leadsheet session persists across reloads: page + stamps in localStorage,
  // the PDF binary in IndexedDB (see pdf-store).
  const [pdfPage, setPdfPage] = usePersistentState<number>('pdfPage', 1);
  const [leadsheetStamps, setLeadsheetStamps] = usePersistentState<LeadsheetStamp[]>(
    'leadsheetStamps',
    [],
  );

  // Restore the persisted PDF on mount so the leadsheet stamp log isn't orphaned.
  useEffect(() => {
    let cancelled = false;
    loadPdf()
      .then((file) => {
        if (!cancelled && file) setPdfFile(file);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Leadsheet: deliberately stamp the current page at the current playback time.
  // setLeadsheetStamps is a stable useState setter (via usePersistentState).
  const stampLeadsheetPage = useCallback(() => {
    setLeadsheetStamps((arr) => [...arr, { page: pdfPage, region: '', ts: time }]);
  }, [pdfPage, time, setLeadsheetStamps]);

  // Leadsheet: remove a stamp by index.
  const removeLeadsheetStamp = useCallback((i: number) => {
    setLeadsheetStamps((arr) => arr.filter((_, j) => j !== i));
  }, [setLeadsheetStamps]);

  // ---- Named sessions ----
  const [sessionsOpen, setSessionsOpen] = useState<boolean>(false);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionNameDraft, setSessionNameDraft] = useState<string>('');

  const refreshSessions = useCallback(() => {
    listSessions().then(setSessionList).catch(() => {});
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Run the one-time IndexedDB → server migration on mount, then refresh the
  // session list so any migrated sessions are immediately visible.
  useEffect(() => {
    runSessionMigration().finally(() => refreshSessions());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSession = useCallback(
    async (forceNew: boolean) => {
      const name = sessionNameDraft.trim() || songName.trim() || 'Untitled session';
      const state: SessionState = { song, songName, pasteText, stamps, cursor, tab, pdfPage, leadsheetStamps };
      try {
        const id = await saveSession(
          name,
          state,
          pdfFile,
          forceNew ? undefined : currentSessionId ?? undefined,
          Date.now(),
        );
        setCurrentSessionId(id);
        setSessionNameDraft(name);
        refreshSessions();
        pushToast(`Saved session "${name}"`);
      } catch {
        pushToast('Failed to save session');
      }
    },
    [sessionNameDraft, songName, song, pasteText, stamps, cursor, tab, pdfPage, leadsheetStamps, pdfFile, currentSessionId, refreshSessions, pushToast],
  );

  const handleLoadSession = useCallback(
    async (id: string) => {
      try {
        const full = await getSession(id);
        if (!full) {
          pushToast('Session not found');
          return;
        }
        const s = full.state;
        setSong(s.song);
        setSongName(s.songName);
        setPasteText(s.pasteText);
        setStamps(s.stamps);
        setCursor(s.cursor);
        setTab(s.tab);
        setPdfPage(s.pdfPage);
        setLeadsheetStamps(s.leadsheetStamps);
        if (full.pdf) {
          setPdfFile(full.pdf);
          savePdf(full.pdf).catch(() => {});
        } else {
          setPdfFile(null);
          clearPdf().catch(() => {});
        }
        setCurrentSessionId(full.meta.id);
        setSessionNameDraft(full.meta.name);
        setSessionsOpen(false);
        pushToast(`Loaded "${full.meta.name}"`);
      } catch {
        pushToast('Failed to load session');
      }
    },
    [pushToast, setSong, setSongName, setPasteText, setStamps, setCursor, setTab, setPdfPage, setLeadsheetStamps],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id);
        if (currentSessionId === id) setCurrentSessionId(null);
        refreshSessions();
      } catch {
        pushToast('Failed to delete session');
      }
    },
    [currentSessionId, refreshSessions, pushToast],
  );

  const handleNewSession = useCallback(() => {
    const hasWork = stamps.length > 0 || leadsheetStamps.length > 0 || pasteText.trim() !== '';
    if (hasWork && !window.confirm('Start a new blank session? Unsaved changes to the current working session will be cleared (saved sessions are not affected).')) {
      return;
    }
    setSong(EMPTY_SONG);
    setSongName('');
    setPasteText('');
    setStamps([]);
    setCursor(0);
    setLeadsheetStamps([]);
    setPdfPage(1);
    setPdfFile(null);
    clearPdf().catch(() => {});
    setCurrentSessionId(null);
    setSessionNameDraft('');
    setSessionsOpen(false);
  }, [stamps.length, leadsheetStamps.length, pasteText, setSong, setSongName, setPasteText, setStamps, setCursor, setLeadsheetStamps, setPdfPage]);

  // ---- Cursor lookup helpers ----
  const lineCount = useMemo(
    () => song.lines.filter((l) => l.text).length,
    [song],
  );

  const lineIndexOfCursor = useMemo(() => {
    let n = 0;
    for (let i = 0; i < song.lines.length; i++) {
      if (song.lines[i].text) {
        n++;
        if (i === cursor) return n;
      }
    }
    return n;
  }, [cursor, song]);

  const currentLineObj = song.lines[cursor] ?? {};

  const findNextTextLine = useCallback((from: number, dir: number): number | null => {
    let i = from + dir;
    while (i >= 0 && i < song.lines.length) {
      if (song.lines[i].text) return i;
      i += dir;
    }
    return null;
  }, [song]);

  const nextTextIdx = useMemo(() => findNextTextLine(cursor, 1), [cursor, findNextTextLine]);
  const nextLine =
    nextTextIdx != null ? (song.lines[nextTextIdx]?.text ?? null) : null;

  // The previous lyric line — the one just stamped / currently playing. Shown
  // above the "next to stamp" target so the operator can follow along.
  const prevTextIdx = useMemo(() => findNextTextLine(cursor, -1), [cursor, findNextTextLine]);
  const prevLine =
    prevTextIdx != null ? (song.lines[prevTextIdx]?.text ?? null) : null;

  // Section header (preceding) for current line
  const currentSectionLabel = useMemo(() => {
    // Guard against an empty song (lines: []) or a cursor that points past the
    // end of the current song — song.lines[i] can be undefined in both cases.
    for (let i = Math.min(cursor, song.lines.length - 1); i >= 0; i--) {
      const section = song.lines[i]?.section;
      if (section) return section;
    }
    return null;
  }, [cursor, song]);

  // ---- Stamp actions ----
  const stamp = useCallback(
    (advance: number = 1) => {
      if (!currentLineObj.text) {
        // skip section header — move past it
        const target = findNextTextLine(cursor, advance >= 0 ? 1 : -1);
        if (target != null) setCursor(target);
        return;
      }
      const newStamp: InitialStamp = {
        idx: cursor,
        ts: time,
        sectionStart: currentSectionLabel ?? undefined,
      };
      setStamps((arr) => {
        const next = [...arr, newStamp];
        setFlashIdx(next.length - 1);
        setTimeout(() => setFlashIdx(null), 600);
        return next;
      });

      const target = findNextTextLine(cursor, advance >= 0 ? 1 : -1);
      if (target != null) setCursor(target);
    },
    // setCursor / setStamps are stable useState setters (via usePersistentState).
    [cursor, time, currentLineObj.text, currentSectionLabel, findNextTextLine, setCursor, setStamps],
  );

  const undoStamp = useCallback((i: number) => {
    setStamps((arr) => arr.filter((_, j) => j !== i));
  }, [setStamps]);

  // Edit a single stamp's lyric text (override). Empty text clears the override
  // so the row falls back to the parsed song line.
  const editStampText = useCallback((i: number, text: string) => {
    setStamps((arr) =>
      arr.map((s, j) => (j === i ? { ...s, text: text.trim() === '' ? undefined : text } : s)),
    );
  }, [setStamps]);

  // onReload — POST /api/song with current songName + pasteText, replace song state.
  const onReload = useCallback(async () => {
    setReloading(true);
    try {
      const res = await fetch('/api/song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: songName, chordpro: pasteText }),
      });
      if (!res.ok) {
        let errMsg = 'Unknown error';
        try {
          const body = await res.json() as { error?: string; message?: string };
          errMsg = body.error ?? body.message ?? errMsg;
        } catch {
          // body not JSON — use status text
          errMsg = res.statusText || errMsg;
        }
        pushToast(`Failed to parse: ${errMsg}`);
        return;
      }
      let parsed: Song;
      try {
        parsed = await res.json() as Song;
      } catch {
        pushToast('Backend returned malformed JSON');
        return;
      }
      setSong(parsed);
      setSongName(parsed.name);
      // Land the cursor on the first line that has lyric text, skipping any
      // leading section header — otherwise the preview shows "—" until the
      // user advances past the header.
      const firstTextIdx = parsed.lines.findIndex((l) => l.text);
      setCursor(firstTextIdx >= 0 ? firstTextIdx : 0);
      setStamps([]);
      const textLines = parsed.lines.filter((l) => l.text).length;
      pushToast(`Loaded ${parsed.name}`, `${textLines} lines`);
    } catch {
      pushToast('Backend unreachable');
    } finally {
      setReloading(false);
    }
    // setSong / setSongName / setCursor / setStamps are stable useState setters.
  }, [songName, pasteText, pushToast, setSong, setSongName, setCursor, setStamps]);

  // exportLyrics — POST /api/export/als and trigger browser download.
  const exportLyrics = useCallback(async () => {
    const filename = `${song.name.replace(/\s+/g, '_')}.als`;
    const payload = {
      song,
      stamps: stamps.map((s, i) => ({
        id: `stamp-${i}-${s.ts}`,
        lineIdx: s.idx,
        lineText: s.text ?? song.lines[s.idx]?.text ?? '',
        section: s.sectionStart ?? null,
        ts: s.ts,
        beats: 0,
      })),
    };
    try {
      const res = await fetch('/api/export/als', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errMsg = 'Unknown error';
        try {
          const body = await res.json() as { error?: string; message?: string };
          errMsg = body.error ?? body.message ?? errMsg;
        } catch {
          errMsg = res.statusText || errMsg;
        }
        pushToast(`Export failed: ${errMsg}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      pushToast(`Exported ${filename}`, `${stamps.length} clips`);
    } catch {
      pushToast('Export failed: backend unreachable');
    }
  }, [song, stamps, pushToast]);

  // exportLeadsheet — POST /api/export/zip with PNG data URLs for each stamped page.
  const [exportingLeadsheet, setExportingLeadsheet] = useState<boolean>(false);

  const exportLeadsheet = useCallback(async () => {
    if (!pdfFile) {
      pushToast('No PDF loaded');
      return;
    }
    if (leadsheetStamps.length === 0) {
      pushToast('No stamps to export');
      return;
    }

    setExportingLeadsheet(true);
    pushToast('Rendering pages…');

    try {
      // Dedupe pages and render each exactly once.
      const uniquePages = [...new Set(leadsheetStamps.map((s) => s.page))];
      const pageDataUrls = new Map<number, string>();
      for (const page of uniquePages) {
        pageDataUrls.set(page, await pageRenderer.renderToDataUrl(page));
      }

      const sheetStamps = leadsheetStamps.map((s, i) => ({
        id: `sheet-${i}-${s.ts}`,
        page: s.page,
        region: s.region ?? '',
        imageRef: `page${s.page}.png`,
        pngDataUrl: pageDataUrls.get(s.page)!,
        ts: s.ts,
      }));

      const filename = `${song.name.replace(/\s+/g, '_')}.zip`;

      // Include lyric stamps so the bundled .als populates BOTH tracks
      // (lyrics + leadsheet) when the user has stamped lyrics in this session.
      const lyricStamps = stamps.map((s) => ({
        ts: s.ts,
        text: s.text ?? song.lines[s.idx]?.text ?? '',
      }));

      // Name the Lyrics subfolder after the loaded PDF (sans extension), matching
      // AbleSet's own export convention.
      const leadsheetName = (pdfFile?.name ?? 'leadsheet').replace(/\.pdf$/i, '');

      const res = await fetch('/api/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song,
          stamps: sheetStamps,
          lyricStamps,
          leadsheetName,
          timeSig: { num: numerator, den: denominator },
        }),
      });

      if (!res.ok) {
        let errMsg = 'Unknown error';
        try {
          const body = await res.json() as { error?: string; message?: string };
          errMsg = body.error ?? body.message ?? errMsg;
        } catch {
          errMsg = res.statusText || errMsg;
        }
        pushToast(`Export failed: ${errMsg}`);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const downloadName = match?.[1] ?? filename;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      pushToast(
        `Exported ${downloadName}`,
        `${leadsheetStamps.length} page · ${lyricStamps.length} lyric clips`,
      );
    } catch {
      pushToast('Export failed: backend unreachable');
    } finally {
      setExportingLeadsheet(false);
    }
  }, [pdfFile, leadsheetStamps, pageRenderer, song, stamps, numerator, denominator, pushToast]);

  const exportFile = useCallback(() => {
    if (tab === 'lyrics') {
      void exportLyrics();
    } else {
      void exportLeadsheet();
    }
  }, [tab, exportLyrics, exportLeadsheet]);

  // ---- Keyboard handler ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Suppress shortcuts when typing in form fields
      const tag = ((e.target as HTMLElement | null)?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        // Optimistically flip the pill; the next OSC tick will confirm (~100 ms).
        setPlaying((p) => {
          sendCommand({ type: 'transport', action: p ? 'pause' : 'play' });
          return !p;
        });
        setPressed('space');
        setTimeout(() => setPressed(null), 160);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (tab === 'lyrics') {
          stamp(1);
        } else {
          // Leadsheet: navigate pages only. Stamping is a deliberate action
          // (the "Stamp page" button) — navigating must never create stamps.
          setPdfPage((p) => Math.min(Math.max(pageRenderer.pageCount, 1), p + 1));
        }
        setPressed('right');
        setTimeout(() => setPressed(null), 160);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (tab === 'lyrics') {
          stamp(-1);
        } else {
          setPdfPage((p) => Math.max(1, p - 1));
        }
        setPressed('left');
        setTimeout(() => setPressed(null), 160);
      } else if (e.key.toLowerCase() === 'e') {
        exportFile();
        setPressed('e');
        setTimeout(() => setPressed(null), 160);
      } else if (e.code === 'Enter' && tab === 'leadsheet') {
        // Stamp the current leadsheet page at the current time (stay on page).
        e.preventDefault();
        stampLeadsheetPage();
        setPressed('enter');
        setTimeout(() => setPressed(null), 160);
      } else if (e.key.toLowerCase() === 't') {
        setTab((x) => (x === 'lyrics' ? 'leadsheet' : 'lyrics'));
      } else if (e.key.toLowerCase() === 's') {
        // Stop: return the playhead to the start. After this, Space (play)
        // resumes from 0, i.e. plays from the beginning.
        e.preventDefault();
        transport('stop');
        setPressed('s');
        setTimeout(() => setPressed(null), 160);
      } else if (e.code === 'ArrowUp' && tab === 'lyrics') {
        e.preventDefault();
        const prev = findNextTextLine(cursor, -1);
        if (prev != null) setCursor(prev);
        setPressed('up');
        setTimeout(() => setPressed(null), 160);
      } else if (e.code === 'ArrowDown' && tab === 'lyrics') {
        e.preventDefault();
        const nxt = findNextTextLine(cursor, 1);
        if (nxt != null) setCursor(nxt);
        setPressed('down');
        setTimeout(() => setPressed(null), 160);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // setCursor / setTab / setPdfPage are stable useState setters (via usePersistentState).
  }, [cursor, time, tab, stamps, stamp, exportFile, sendCommand, transport, stampLeadsheetPage, pageRenderer.pageCount, findNextTextLine, setCursor, setTab, setPdfPage]);

  // ---- Auto-scroll log to bottom on new stamp ----
  const logScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [stamps.length]);

  // ---- Apply theme + accent + lyric-size at root ----
  useEffect(() => {
    document.documentElement.dataset['theme'] = tweaks.theme;
    document.documentElement.dataset['accent'] = tweaks.accent;
    document.documentElement.dataset['lyricSize'] = tweaks.lyricSize;
  }, [tweaks.theme, tweaks.accent, tweaks.lyricSize]);

  // ---- Build stamp log rows (with optional section dividers) ----
  const stampRows = useMemo<StampRow[]>(() => {
    const rows: StampRow[] = [];
    let lastSection: string | null = null;
    stamps.forEach((s, i) => {
      const lineObj = song.lines[s.idx];
      const sec = s.sectionStart ?? null;
      if (tweaks.showSectionHeaders && sec && sec !== lastSection) {
        rows.push({ kind: 'section', label: sec, key: `sec-${i}` });
        lastSection = sec;
      } else if (sec) {
        lastSection = sec;
      }
      rows.push({
        kind: 'row',
        i,
        ts: s.ts,
        text: s.text ?? lineObj?.text ?? '—',
        recent: i === stamps.length - 1,
        flash: flashIdx === i,
      });
    });
    return rows;
  }, [stamps, flashIdx, tweaks.showSectionHeaders, song]);

  return (
    <div className="app">
      {/* HEADER */}
      <header className={`header${tweaks.headerCompact ? ' compact' : ''}`}>
        <div className="wordmark">
          <span className="dot" />
          <span className="name">
            AbleSet<span className="dim"> Sync</span>
          </span>
        </div>

        <span className="header-divider" />

        <span className={`badge${connected ? ' connected' : ''}`}>
          <span className="pulse" />
          {connected ? 'Connected' : 'Disconnected'}
        </span>

        <span className="header-divider" />

        <div className="live-meter">
          <div className="transport" role="group" aria-label="Transport controls">
            <button
              className={`tbtn${playing ? ' active' : ''}`}
              onClick={() => transport('play')}
              disabled={!connected}
              title="Play (resume from current position)"
              aria-label="Play"
            >
              <Icon name="play" size={12} />
            </button>
            <button
              className="tbtn"
              onClick={() => transport('pause')}
              disabled={!connected}
              title="Pause (stay at current position)"
              aria-label="Pause"
            >
              <Icon name="pause" size={12} />
            </button>
            <button
              className="tbtn"
              onClick={() => transport('stop')}
              disabled={!connected}
              title="Stop (return to start)"
              aria-label="Stop and return to start"
            >
              <Icon name="stop" size={12} />
            </button>
          </div>
          <span className="time" title="Bar.Beat.Sixteenth">
            {formatPos(time)}
          </span>
          <span className="bpm">
            <span className="val">{liveBpm}</span>
            <span className="label">BPM</span>
            <span className="dot-sep" />
            <span className="val">{song.key}</span>
            <span className="label">KEY</span>
          </span>
        </div>

        <div className="tabs">
          <button
            className={`tab${tab === 'lyrics' ? ' active' : ''}`}
            onClick={() => setTab('lyrics')}
          >
            Lyrics
          </button>
          <button
            className={`tab${tab === 'leadsheet' ? ' active' : ''}`}
            onClick={() => setTab('leadsheet')}
          >
            Leadsheet
          </button>
        </div>

        <div className="header-actions">
          <div className="sessions">
            <button
              className="btn"
              onClick={() => {
                setSessionsOpen((o) => !o);
                refreshSessions();
                setSessionNameDraft((d) => d || songName);
              }}
              title="Save and switch between named sessions"
            >
              <Icon name="file" size={12} />
              Sessions{currentSessionId ? ' •' : ''}
            </button>
            {sessionsOpen && (
              <div className="sessions-menu">
                <div className="sessions-save">
                  <input
                    className="input"
                    value={sessionNameDraft}
                    placeholder="Session name"
                    onChange={(e) => setSessionNameDraft(e.target.value)}
                  />
                  <button className="btn primary" onClick={() => handleSaveSession(false)}>
                    {currentSessionId ? 'Update' : 'Save'}
                  </button>
                </div>
                <div className="sessions-row-actions">
                  <button className="btn" onClick={() => handleSaveSession(true)}>Save as new</button>
                  <button className="btn" onClick={handleNewSession}>New blank</button>
                </div>
                <div className="sessions-list">
                  {sessionList.length === 0 && (
                    <div className="sessions-empty">No saved sessions yet</div>
                  )}
                  {sessionList.map((s) => (
                    <div
                      key={s.id}
                      className={`session-row${s.id === currentSessionId ? ' current' : ''}`}
                    >
                      <button
                        className="session-load"
                        onClick={() => handleLoadSession(s.id)}
                        title="Load this session"
                      >
                        <span className="session-name">{s.name}</span>
                        <span className="session-meta">
                          {s.hasPdf ? 'PDF · ' : ''}
                          {fmtSavedAt(s.savedAt)}
                        </span>
                      </button>
                      <button
                        className="session-del"
                        onClick={() => handleDeleteSession(s.id)}
                        title="Delete this session"
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Track picker — shown in lyrics tab when Ableton is connected */}
          {tab === 'lyrics' && (
            <div className="live-track-picker">
              <select
                className="select"
                aria-label="Ableton track"
                value={liveTrackIndex ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setLiveTrackIndex(val === '' ? null : Number(val));
                }}
                disabled={!connected || liveTracks.length === 0}
                title={connected ? (liveTracks.length === 0 ? 'No tracks available' : 'Select target track') : 'Ableton not connected'}
              >
                <option value="">— track —</option>
                {liveTracks.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name.includes('+LYRICS') ? `★ ${t.name}` : t.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={!connected}
                title="Refresh track list"
                aria-label="Refresh Ableton tracks"
                onClick={() => {
                  if (!connected) return;
                  fetch('/api/live/tracks')
                    .then((r) => (r.ok ? r.json() as Promise<{ index: number; name: string }[]> : Promise.resolve([])))
                    .then((tracks) => setLiveTracks(tracks))
                    .catch(() => {});
                }}
              >
                ↺
              </button>
            </div>
          )}
          {/* Apply to Ableton — only in lyrics tab */}
          {tab === 'lyrics' && (
            <button
              className="btn apply-btn"
              onClick={() => { void applyToAbleton(); }}
              disabled={applyDisabledReason !== null || applyingToAbleton}
              title={applyDisabledReason ?? 'Write all stamps to Ableton Arrangement'}
              data-apply-reason={applyDisabledReason ?? undefined}
            >
              {applyingToAbleton ? 'Applying…' : 'Apply to Ableton'}
            </button>
          )}
          <button
            className="btn primary"
            onClick={exportFile}
            disabled={tab === 'leadsheet' && exportingLeadsheet}
          >
            <Icon name="download" size={12} />
            {tab === 'leadsheet' && exportingLeadsheet
              ? 'Exporting…'
              : `Export ${tab === 'lyrics' ? '.als' : '.zip'}`}
          </button>
        </div>
      </header>

      {/* Handler-absent banner (issue G) — shown when remote script is not loaded */}
      {handlerStatus === 'absent' && (
        <div className="handler-absent-banner" role="alert">
          Remote script not loaded — run{' '}
          <code>npm run install:remote-script</code>
          {' '}and restart Ableton.
        </div>
      )}

      {/* MAIN */}
      <div className="main">
        {tab === 'lyrics' ? (
          <LyricsView
            songName={songName}
            setSongName={setSongName}
            pasteText={pasteText}
            setPasteText={setPasteText}
            onReload={onReload}
            reloading={reloading}
            lineCount={lineCount}
            setupOpen={setupOpen}
            setSetupOpen={setSetupOpen}
            currentLine={currentLineObj.text}
            currentSection={currentSectionLabel}
            prevLine={prevLine}
            nextLine={nextLine}
            lineIndex={lineIndexOfCursor}
            lineTotal={lineCount}
            stampRows={stampRows}
            stampsCount={stamps.length}
            onUndo={undoStamp}
            onSeek={seekToStamp}
            onEditText={editStampText}
            formatPos={formatPos}
            logWidth={logWidth}
            onResizeLog={setLogWidth}
            logScrollRef={logScrollRef}
            tweaks={tweaks}
          />
        ) : (
          <LeadsheetView
            songName={songName}
            setSongName={setSongName}
            page={pdfPage}
            setPage={setPdfPage}
            stamps={leadsheetStamps}
            onStampPage={stampLeadsheetPage}
            onRemove={removeLeadsheetStamp}
            formatPos={formatPos}
            logWidth={logWidth}
            onResizeLog={setLogWidth}
            tweaks={tweaks}
            pdfFile={pdfFile}
            onPdfChange={(file) => {
              setPdfFile(file);
              setPdfPage(1);
              // Persist the new PDF (and clear leadsheet stamps that belonged to
              // the previous PDF — they'd point at the wrong pages).
              setLeadsheetStamps([]);
              savePdf(file).catch(() => {});
            }}
            pageRenderer={pageRenderer}
          />
        )}
      </div>

      {/* HINT BAR */}
      <footer className="hintbar">
        <div className="hints">
          <span className="hint">
            <span className={`kbd wide${pressed === 'space' ? ' pressed' : ''}`}>SPACE</span>
            {playing ? 'Pause' : 'Play'}
          </span>
          <span className="hint">
            <span className={`kbd${pressed === 's' ? ' pressed' : ''}`}>S</span>
            Stop (to start)
          </span>
          {tab === 'leadsheet' && (
            <span className="hint">
              <span className={`kbd wide${pressed === 'enter' ? ' pressed' : ''}`}>ENTER</span>
              Stamp page
            </span>
          )}
          <span className="hint">
            <span className={`kbd${pressed === 'right' ? ' pressed' : ''}`}>→</span>
            {tab === 'lyrics' ? 'Stamp & advance' : 'Next page'}
          </span>
          <span className="hint">
            <span className={`kbd${pressed === 'left' ? ' pressed' : ''}`}>←</span>
            {tab === 'lyrics' ? 'Stamp & back' : 'Prev page'}
          </span>
          <span className="hint">
            <span className={`kbd${pressed === 'up' ? ' pressed' : ''}`}>↑</span>
            <span className={`kbd${pressed === 'down' ? ' pressed' : ''}`} style={{ marginLeft: 2 }}>↓</span>
            Navigate
          </span>
          <span className="hint">
            <span className={`kbd${pressed === 'e' ? ' pressed' : ''}`}>E</span>
            Export
          </span>
          <span className="hint">
            <span className="kbd">T</span>
            Switch tab
          </span>
        </div>
        <div className="right">
          <span>
            {tab === 'lyrics'
              ? `${stamps.length} stamps`
              : `page ${pdfPage}/${pageRenderer.pageCount > 0 ? pageRenderer.pageCount : 1}`}
          </span>
          <span className="dot-sep" />
          <span>v0.3.1</span>
        </div>
      </footer>

      {/* TOASTS */}
      <div className="toast-host">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span className="check">
              <Icon name="check" size={11} />
            </span>
            <span>{t.msg}</span>
            {t.meta && <span className="meta">{t.meta}</span>}
          </div>
        ))}
      </div>

      {/* TWEAKS */}
      <TweaksUI tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}
