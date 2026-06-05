// views.tsx — LyricsView, LeadsheetView, TweaksUI
// Ported from design/views.jsx. Class names and markup kept identical.
import React, { useRef, useEffect } from 'react';
import { Icon } from './icons';
import {
  TweaksPanel,
  TweakSection,
  TweakRadio,
  TweakSelect,
  TweakToggle,
} from './tweaks-panel';
import { fmt } from './format';
import { type PdfRenderer } from './use-pdf';
import { type Tweaks } from './use-tweaks';

export type { Tweaks };

// ---------------------------------------------------------------------------
// Stamp-log row types (rendered by LyricsView).
// ---------------------------------------------------------------------------
type StampRowSection = {
  kind: 'section';
  label: string;
  key: string;
};

type StampRowEntry = {
  kind: 'row';
  i: number;
  ts: number;
  text: string;
  recent: boolean;
  flash: boolean;
};

export type StampRow = StampRowSection | StampRowEntry;

// ---------------------------------------------------------------------------
// LyricsView
// ---------------------------------------------------------------------------
export interface LyricsViewProps {
  songName: string;
  setSongName: (name: string) => void;
  pasteText: string;
  setPasteText: (text: string) => void;
  onReload: () => void | Promise<void>;
  reloading: boolean;
  lineCount: number;
  setupOpen: boolean;
  setSetupOpen: (open: boolean) => void;
  currentLine: string | undefined;
  currentSection: string | null | undefined;
  nextLine: string | null | undefined;
  lineIndex: number;
  lineTotal: number;
  stampRows: StampRow[];
  stampsCount: number;
  onUndo: (i: number) => void;
  onSeek: (i: number) => void;
  logScrollRef: React.RefObject<HTMLDivElement>;
  tweaks: Tweaks;
}

export const LyricsView: React.FC<LyricsViewProps> = (props) => {
  const {
    songName, setSongName, pasteText, setPasteText, onReload, reloading, lineCount,
    setupOpen, setSetupOpen,
    currentLine, currentSection, nextLine,
    lineIndex, lineTotal,
    stampRows, stampsCount, onUndo, onSeek,
    logScrollRef, tweaks,
  } = props;

  const progressPct = Math.round((lineIndex / Math.max(1, lineTotal)) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* SETUP — collapsible */}
      <section className="setup">
        <div className="setup-header" onClick={() => setSetupOpen(!setupOpen)}>
          <div className="left">
            <Icon name="chevron-right" size={12} className={`chevron${setupOpen ? ' open' : ''}`} />
            <span className="label">Song</span>
            <span className="song-name">{songName}</span>
            <span className="meta">· {stampsCount} stamps · loaded</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="meta" style={{ color: 'var(--fg-3)' }}>
              ChordPro · {lineCount} lines
            </span>
            <span className="meta">{setupOpen ? 'Hide' : 'Edit'}</span>
          </div>
        </div>
        {setupOpen && (
          <div className="setup-body">
            <div className="field">
              <label className="field-label">Song name</label>
              <input
                className="input"
                value={songName}
                onChange={(e) => setSongName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Lyrics (ChordPro)</label>
              <textarea
                className="textarea"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="actions">
              <button
                className="btn primary"
                onClick={onReload}
                disabled={reloading}
              >
                <Icon name="music" size={12} />
                {reloading ? 'Loading…' : 'Reload song'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* WORKSPACE */}
      <div className={`workspace${tweaks.logDensity === 'spacious' ? ' spacious-log' : ''}`}>
        {/* Lyric viewer */}
        <div className="viewer">
          {tweaks.showSectionHeaders && currentSection && (
            <div className="section-eyebrow">{currentSection}</div>
          )}
          <div className="stamp-target-label">Next to stamp &rarr;</div>
          <div className="lyric-current next-up" key={currentLine}>
            {currentLine || '—'}
          </div>
          {nextLine && (
            <div className="lyric-next">{nextLine}</div>
          )}

          <div className="lyric-progress">
            <span>Line {lineIndex} of {lineTotal}</span>
            <span className="progress-bar">
              <span className="fill" style={{ width: progressPct + '%' }} />
            </span>
            <span style={{ color: 'var(--fg-2)' }}>{progressPct}%</span>
          </div>
        </div>

        {/* Stamp log */}
        <aside className="log">
          <div className="log-header">
            <span className="title">Stamp Log</span>
            <span className="count">{stampsCount} entries</span>
          </div>
          <div className="log-scroll" ref={logScrollRef}>
            {stampRows.map((r) => {
              if (r.kind === 'section') {
                return <div className="log-row section" key={r.key}>{r.label}</div>;
              }
              return (
                <div
                  className={`log-row clickable${r.recent ? ' recent' : ''}${r.flash ? ' flash' : ''}`}
                  key={r.i}
                  onClick={() => onSeek(r.i)}
                  title="Jump playhead to this stamp"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSeek(r.i);
                    }
                  }}
                >
                  <span className="ts">{fmt(r.ts)}</span>
                  <span className="idx">#{String(r.i + 1).padStart(2, '0')}</span>
                  <span className="text" title={r.text}>{r.text}</span>
                  <button
                    className="undo"
                    onClick={(e) => { e.stopPropagation(); onUndo(r.i); }}
                    title="Undo stamp"
                  >
                    <Icon name="undo" size={11} />
                  </button>
                </div>
              );
            })}
            {/* Pending hint row */}
            <div className="log-row" style={{ opacity: 0.45, borderLeftColor: 'var(--line-2)' }}>
              <span className="ts" style={{ color: 'var(--fg-4)' }}>—:——</span>
              <span className="idx">·</span>
              <span className="text" style={{ fontStyle: 'italic', color: 'var(--fg-3)' }}>
                next: stamp on →
              </span>
              <span />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// LeadsheetView
// ---------------------------------------------------------------------------
export interface LeadsheetStamp {
  page: number;
  region: string;
  ts: number;
}

export interface LeadsheetViewProps {
  songName: string;
  setSongName: (name: string) => void;
  page: number;
  setPage: (page: number) => void;
  stamps: LeadsheetStamp[];
  onStampPage: () => void;
  onRemove: (i: number) => void;
  tweaks: Tweaks;
  pdfFile: File | null;
  onPdfChange: (file: File) => void;
  pageRenderer: PdfRenderer;
}

export const LeadsheetView: React.FC<LeadsheetViewProps> = ({
  songName,
  setSongName,
  page,
  setPage,
  stamps,
  onStampPage,
  onRemove,
  tweaks,
  pdfFile,
  onPdfChange,
  pageRenderer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { pageCount, renderToCanvas } = pageRenderer;

  // Re-render whenever the page or the PDF changes.
  useEffect(() => {
    if (!pdfFile || !canvasRef.current) return;
    let cancelled = false;
    renderToCanvas(page, canvasRef.current).catch((err) => {
      if (!cancelled) console.error('[LeadsheetView] render error:', err);
    });
    return () => { cancelled = true; };
  }, [page, pdfFile, renderToCanvas]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) onPdfChange(picked);
    // Reset input so the same file can be re-selected if needed.
    e.target.value = '';
  };

  const totalPages = pageCount > 0 ? pageCount : 1;
  const displayName = pdfFile ? pdfFile.name : 'untitled-leadsheet.pdf';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Setup row */}
      <section className="setup">
        <div className="setup-header" style={{ cursor: 'default' }}>
          <div className="left">
            <Icon name="file" size={12} />
            <span className="label">PDF</span>
            <span className="song-name">{displayName}</span>
            {pdfFile ? (
              <span className="meta">· {pageCount} pages · loaded</span>
            ) : (
              <span className="meta">· no PDF loaded</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              style={{ padding: '5px 9px', fontSize: 12, width: 220 }}
            />
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              Change PDF
            </button>
          </div>
        </div>
      </section>

      <div className={`workspace${tweaks.logDensity === 'spacious' ? ' spacious-log' : ''}`}>
        <div className="viewer">
          <div className="leadsheet-stage">
            <div className="pdf-frame">
              {pdfFile ? (
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', maxWidth: '100%' }}
                />
              ) : (
                <div
                  className="pdf-page"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 320,
                    gap: 12,
                    opacity: 0.6,
                  }}
                >
                  <Icon name="file" size={32} />
                  <div style={{ fontSize: 14, color: 'var(--fg-2)' }}>
                    Drop or select a PDF to begin
                  </div>
                  <button
                    className="btn primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select PDF
                  </button>
                </div>
              )}
              <div className="pdf-page-no">— {page} —</div>
            </div>

            <div className="page-controls">
              <button
                className="arrow"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <Icon name="chevron-left" size={14} />
              </button>
              <span className="pageno">page {page} / {totalPages}</span>
              <button
                className="arrow"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <Icon name="chevron-right" size={14} />
              </button>
              <button
                className="btn primary"
                onClick={onStampPage}
                disabled={!pdfFile}
                title="Stamp this page at the current playback time"
                style={{ marginLeft: 10 }}
              >
                <Icon name="check" size={12} /> Stamp page
              </button>
            </div>
          </div>
        </div>

        <aside className="log">
          <div className="log-header">
            <span className="title">Stamp Log</span>
            <span className="count">{stamps.length} entries</span>
          </div>
          <div className="log-scroll">
            {stamps.map((s, i) => (
              <div
                className={`log-row${i === stamps.length - 1 ? ' recent' : ''}`}
                key={i}
              >
                <span className="ts">{fmt(s.ts)}</span>
                <span className="idx">p{s.page}</span>
                <span className="text" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  [img:page{s.page}.png] · {s.region}
                </span>
                <button className="undo" onClick={() => onRemove(i)} title="Remove stamp">
                  <Icon name="undo" size={11} />
                </button>
              </div>
            ))}
            {stamps.length === 0 && (
              <div className="log-row" style={{ opacity: 0.45 }}>
                <span className="ts" style={{ color: 'var(--fg-4)' }}>—:——</span>
                <span className="idx">·</span>
                <span className="text" style={{ fontStyle: 'italic', color: 'var(--fg-3)' }}>
                  next: stamp on →
                </span>
                <span />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TweaksUI — the panel UI that invokes the tweaks-panel primitives.
// ---------------------------------------------------------------------------
export interface TweaksUIProps {
  tweaks: Tweaks;
  setTweak: (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void;
}

export const TweaksUI: React.FC<TweaksUIProps> = ({ tweaks, setTweak }) => (
  <TweaksPanel title="Tweaks">
    <TweakSection label="Theme">
      <TweakRadio
        label="Color theme"
        value={tweaks.theme}
        onChange={(v) => setTweak('theme', v as Tweaks['theme'])}
        options={[
          { label: 'Dark', value: 'dark' },
          { label: 'Light', value: 'light' },
        ]}
      />
      <TweakSelect
        label="Accent color"
        value={tweaks.accent}
        onChange={(v) => setTweak('accent', v as Tweaks['accent'])}
        options={[
          { label: 'Teal (default)', value: 'teal' },
          { label: 'Amber', value: 'amber' },
          { label: 'Electric blue', value: 'blue' },
          { label: 'Violet', value: 'violet' },
        ]}
      />
    </TweakSection>

    <TweakSection label="Layout">
      <TweakToggle
        label="Compact header"
        value={tweaks.headerCompact}
        onChange={(v) => setTweak('headerCompact', v)}
      />
      <TweakRadio
        label="Current-line size"
        value={tweaks.lyricSize}
        onChange={(v) => setTweak('lyricSize', v as Tweaks['lyricSize'])}
        options={[
          { label: 'Balanced', value: 'balanced' },
          { label: 'Massive', value: 'massive' },
        ]}
      />
      <TweakRadio
        label="Stamp log density"
        value={tweaks.logDensity}
        onChange={(v) => setTweak('logDensity', v as Tweaks['logDensity'])}
        options={[
          { label: 'Tight', value: 'tight' },
          { label: 'Spacious', value: 'spacious' },
        ]}
      />
      <TweakToggle
        label="Section headers"
        value={tweaks.showSectionHeaders}
        onChange={(v) => setTweak('showSectionHeaders', v)}
      />
    </TweakSection>

  </TweaksPanel>
);
