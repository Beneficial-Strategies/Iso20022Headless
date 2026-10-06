import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { xml } from '@codemirror/lang-xml';

export function XmlPane({ xml: text }: { xml: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [basicSetup, xml(), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping],
      }),
    });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== text) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  }, [text]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white hover:bg-slate-700"
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
      <div ref={host} className="min-h-0 flex-1 overflow-auto rounded border border-slate-300 text-xs" />
    </div>
  );
}
