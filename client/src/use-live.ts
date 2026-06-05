// use-live.ts — WebSocket hook for live Ableton playback state
// Connects to ws://<host>/live (Vite proxy → backend :7878).
// Exposes { state, sendCommand } where state is driven by LiveMsg events
// and sendCommand sends a ClientMsg to the server over the same socket.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LiveMsg, ClientMsg } from '../../shared/types';

export type LiveState = {
  ts: number;
  bpm: number;
  playing: boolean;
  numerator: number;
  denominator: number;
  connected: boolean; // true only when WS is alive AND Ableton OSC handshake succeeded
};

export type UseLiveReturn = {
  state: LiveState;
  sendCommand: (msg: ClientMsg) => void;
};

const INITIAL_STATE: LiveState = {
  ts: 0,
  bpm: 120,
  playing: false,
  numerator: 4,
  denominator: 4,
  connected: false,
};

const BACKOFF_START_MS = 500;
const BACKOFF_CAP_MS = 5000;

export function useLive(): UseLiveReturn {
  const [state, setState] = useState<LiveState>(INITIAL_STATE);

  // Mutable refs so reconnect closure always has the latest values without
  // needing to re-register the effect.
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef<number>(BACKOFF_START_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef<boolean>(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const url = `ws://${location.host}/live`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close();
          return;
        }
        // Reset backoff on successful open.
        backoffRef.current = BACKOFF_START_MS;
        // Stay disconnected until the server sends a `connection` message
        // confirming the OSC handshake.
      };

      ws.onmessage = (event: MessageEvent) => {
        if (unmountedRef.current) return;
        let msg: LiveMsg;
        try {
          msg = JSON.parse(event.data as string) as LiveMsg;
        } catch {
          return;
        }

        if (msg.type === 'tick') {
          setState((prev) => ({
            ...prev,
            ts: msg.ts,
            bpm: msg.bpm,
            playing: msg.playing,
            numerator: msg.numerator,
            denominator: msg.denominator,
          }));
        } else if (msg.type === 'connection') {
          setState((prev) => ({ ...prev, connected: msg.connected }));
        }
        // 'song' messages are not consumed by this hook yet.
      };

      const handleDisconnect = () => {
        if (unmountedRef.current) return;
        // WS is dead — immediately mark disconnected regardless of Ableton state.
        setState((prev) => ({ ...prev, connected: false }));
        // Schedule reconnect with exponential backoff.
        retryTimerRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_CAP_MS);
          connect();
        }, backoffRef.current);
      };

      ws.onclose = handleDisconnect;
      ws.onerror = handleDisconnect;
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // runs once on mount; reconnect is handled internally

  // sendCommand: write a ClientMsg to the open WS; no-op if closed/connecting
  const sendCommand = useCallback(
    (msg: ClientMsg) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    [],
  );

  return { state, sendCommand };
}
