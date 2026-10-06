import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { xml } from '@codemirror/lang-xml';
import { oneDark } from '@codemirror/theme-one-dark';

export function XmlPane({ xml: text, dark = false }: { xml: string; dark?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [basicSetup, xml(), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping, theme.current.of(dark ? oneDark : [])],
      }),
    });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) });
  }, [dark]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== text) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  }, [text]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          className="rounded bg-fg px-2 py-0.5 text-xs text-surface hover:opacity-80 focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy XML'}
        </button>
      </div>
      <div ref={host} className="min-h-0 flex-1 overflow-auto rounded border border-edge text-xs" />
    </div>
  );
}
