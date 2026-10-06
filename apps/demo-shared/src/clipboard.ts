import { useCallback, useEffect, useRef, useState } from 'react';
import { detectFormat } from '@beneficial-strategies/iso20022-serialize';

/**
 * What is on the clipboard, as far as the browser lets us tell.
 *   xml / json  the clipboard holds text that reads as XML or JSON
 *   none        it holds something else (or nothing)
 *   unknown     we may not look without asking (the first read prompts for permission, or the browser has no
 *               permission query): the paste button stays usable, and clicking it reads (and asks) then
 *   blocked     the user has denied clipboard access to this page
 */
export type ClipboardKind = 'xml' | 'json' | 'none' | 'unknown' | 'blocked';

const classify = (text: string): ClipboardKind => detectFormat(text) ?? 'none';

export interface Clipboard {
  kind: ClipboardKind;
  /** Read the text now. Must be called from a click; may prompt for permission. Throws if it cannot be read. */
  read: () => Promise<string>;
  /** Look again (silently, and only when permission was already granted). */
  refresh: () => Promise<void>;
  /** The page itself just put this text on the clipboard. */
  noteCopied: (text: string) => void;
}

const POLL_MS = 1500;

export function useClipboard(): Clipboard {
  const [kind, setKind] = useState<ClipboardKind>('unknown');
  const last = useRef<{ text: string; kind: ClipboardKind } | undefined>(undefined);

  const set = useCallback((text: string) => {
    if (last.current?.text !== text) last.current = { text, kind: classify(text) };
    setKind(last.current.kind);
  }, []);

  const refresh = useCallback(async () => {
    try {
      if (!navigator.clipboard?.readText) return setKind('unknown');
      // Reading without permission would pop a prompt at page load; only look when it is already granted.
      const perm = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
      if (perm?.state === 'denied') return setKind('blocked');
      if (perm?.state !== 'granted') return setKind('unknown');
      set(await navigator.clipboard.readText());
    } catch {
      setKind('unknown'); // no permission query (Firefox), no focus, or the read failed: leave the button usable
    }
  }, [set]);

  useEffect(() => {
    void refresh();
    const onFocus = (): void => void refresh();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.hasFocus()) void refresh();
    }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  const read = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      set(text);
      return text;
    } catch (e) {
      void refresh(); // a denial shows up as "blocked"
      throw e;
    }
  }, [refresh, set]);

  const noteCopied = useCallback((text: string) => set(text), [set]);

  return { kind, read, refresh, noteCopied };
}
