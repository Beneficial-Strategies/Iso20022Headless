import { useCallback, useEffect, useRef, useState } from 'react';
import { checkSchemaFile, inspectSchema, type SchemaState } from './xsd.ts';

/** What the schema of the chosen message is, and the validation window that goes with it. */
export interface XsdHandle {
  state: SchemaState;
  /** Why the last chosen file was not used (an interface message key and its values), cleared by the next good one. */
  notice: { key: 'xsdNotSchema' | 'xsdWrongSchema' | 'xsdReadFailed'; params: Record<string, string> } | undefined;
  /** Use a schema from a local file. The message's own namespace must match. */
  loadFile: (file: File) => Promise<void>;
  /** The validation window is shown, and follows the XML. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * The XSD of a message: first the address ISO publishes it at (a browser is often not allowed to read it from another
 * site, in which case there is no schema until a local file is chosen). Whatever was loaded is kept until another message
 * is chosen: then everything, including the open validation window, starts over.
 */
export function useXsd(message: { identifier: string; xsdUrl: string; namespace: string | undefined; proxyUrl?: string | undefined } | undefined): XsdHandle {
  const identifier = message?.identifier;
  const url = message?.xsdUrl ?? '';
  const namespace = message?.namespace;
  const proxyUrl = message?.proxyUrl;
  const [state, setState] = useState<SchemaState>({ status: 'loading', url });
  const [notice, setNotice] = useState<XsdHandle['notice']>();
  const [open, setOpen] = useState(false);
  const current = useRef<string | undefined>(identifier);

  useEffect(() => {
    current.current = identifier;
    setNotice(undefined);
    setOpen(false);
    setState({ status: 'loading', url });
    if (!identifier || !namespace) return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
    const get = (from: string): Promise<string> => fetch(from, { signal: abort.signal }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    // the proxy (only given while developing) first, then ISO's own address; the state always names ISO's address
    (proxyUrl ? get(proxyUrl).catch(() => get(url)) : get(url))
      .then((text) => {
        const s = inspectSchema(text);
        const ok = s.isSchema && s.targetNamespace === namespace;
        // a late answer for a message that is no longer chosen is dropped
        setState((cur) => (current.current === identifier && cur.status === 'loading' ? (ok ? { status: 'ready', url, text, source: 'url' } : { status: 'unavailable', url }) : cur));
      })
      .catch(() => setState((cur) => (current.current === identifier && cur.status === 'loading' ? { status: 'unavailable', url } : cur)))
      .finally(() => clearTimeout(timer));
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [identifier, url, namespace, proxyUrl]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!namespace) return;
      let text: string;
      try {
        text = await file.text();
      } catch {
        setNotice({ key: 'xsdReadFailed', params: { file: file.name } });
        return;
      }
      const problem = checkSchemaFile(text, namespace, file.name);
      if (problem) {
        setNotice({ key: problem.en === 'notSchema' ? 'xsdNotSchema' : 'xsdWrongSchema', params: problem.params });
        return;
      }
      setNotice(undefined);
      setState({ status: 'ready', url, text, source: 'file', fileName: file.name });
    },
    [namespace, url],
  );

  return { state, notice, loadFile, open, setOpen };
}
