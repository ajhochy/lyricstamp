import { useCallback, useEffect, useState } from 'react';
import type { RemoteScriptStatus, HandlerStatus } from '../../shared/types';

interface Props {
  connected: boolean;
  handlerStatus: HandlerStatus;
}

export function RemoteScriptSetup({ connected, handlerStatus }: Props): JSX.Element | null {
  const [status, setStatus] = useState<RemoteScriptStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-script/status');
      if (res.ok) setStatus((await res.json()) as RemoteScriptStatus);
    } catch {
      /* leave previous status */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-check the filesystem whenever Live (re)connects — the install may have
  // just taken effect.
  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);

  const install = useCallback(
    async (userLibPath?: string) => {
      setBusy(true);
      setError(null);
      setWarning(null);
      try {
        const res = await fetch('/api/remote-script/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userLibPath ? { userLibPath } : {}),
        });
        const data = (await res.json()) as { error?: string; warning?: string };
        if (!res.ok) {
          setError(data.error ?? 'Install failed');
        } else {
          setWarning(data.warning ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Install failed');
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const onInstallClick = useCallback(async () => {
    if (status && !status.userLibFound && window.lyricstamp) {
      setBusy(true);
      const chosen = await window.lyricstamp.chooseAbletonFolder();
      if (!chosen) {
        setBusy(false);
        return;
      }
      await install(chosen);
      return;
    }
    await install();
  }, [status, install]);

  if (!status) return null;

  const step1Done = status.upToDate;
  const step2Done = connected;
  const step3Done = handlerStatus === 'present';

  if (step1Done && step2Done && step3Done) return null;

  const installLabel = status.installed && !status.upToDate ? 'Update remote script' : 'Install remote script';

  return (
    <div className="remote-script-setup" role="region" aria-label="Ableton setup">
      <div className="rss-title">Finish connecting LyricStamp to Ableton Live</div>
      <ol className="rss-steps">
        <li className={step1Done ? 'done' : ''} data-step="install">
          <span className="rss-mark">{step1Done ? '✓' : '1'}</span>
          <div className="rss-body">
            <b>Install the remote script</b>
            {!step1Done && (
              <div className="rss-actions">
                {!status.userLibFound && !window.lyricstamp && (
                  <span className="rss-hint">Open Ableton Live once, then retry.</span>
                )}
                <button className="btn primary" disabled={busy} onClick={() => void onInstallClick()}>
                  {busy ? 'Installing…' : !status.userLibFound && window.lyricstamp ? 'Locate your Ableton folder…' : installLabel}
                </button>
              </div>
            )}
            {error && <div className="rss-error">{error}</div>}
            {warning && <div className="rss-hint">{warning}</div>}
          </div>
        </li>
        <li className={step2Done ? 'done' : ''} data-step="enable">
          <span className="rss-mark">{step2Done ? '✓' : '2'}</span>
          <div className="rss-body">
            <b>Enable AbletonOSC in Live, then restart it</b>
            {!step2Done && (
              <div className="rss-hint">
                Live → Settings → Link/Tempo/MIDI → set a <b>Control Surface</b> to{' '}
                <b>AbletonOSC</b>, then quit and reopen Live.
              </div>
            )}
          </div>
        </li>
        <li className={step3Done ? 'done' : ''} data-step="handler">
          <span className="rss-mark">{step3Done ? '✓' : '3'}</span>
          <div className="rss-body">
            <b>Patched script detected</b>
            {step2Done && !step3Done && (
              <div className="rss-hint">Restart Live to load the updated script.</div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
