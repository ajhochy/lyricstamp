// use-persistent-state.ts — localStorage-backed drop-in replacement for useState.
//
// Persists state under `ableset-sync.<key>` and rehydrates on mount, so a
// session (loaded song, stamps, cursor, active tab) survives app restarts and
// window reloads. Mirrors the storage conventions of use-tweaks.ts.
//
// Limitation: only JSON-serialisable state can be persisted. The leadsheet PDF
// is a File object and is intentionally NOT persisted here.

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

const PREFIX = 'ableset-sync.';

function load<T>(storageKey: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted / unparseable — fall back to the default silently.
    return defaultValue;
  }
}

/**
 * Like useState, but the value is persisted to localStorage under
 * `ableset-sync.<key>` and restored on the next mount.
 *
 * The returned setter has the exact same signature as useState's, so existing
 * call sites (including functional updates) work unchanged.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = PREFIX + key;

  // Lazy initialiser keeps the localStorage read out of the render phase.
  const [value, setValue] = useState<T>(() => load(storageKey, defaultValue));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Quota exceeded or storage unavailable — ignore.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
