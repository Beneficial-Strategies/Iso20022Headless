import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { xml } from '@codemirror/lang-xml';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { useI18n } from '@beneficial-strategies/iso20022-react-ui';

/** Read-only, highlighted view of the generated XML or JSON, with a copy button. */
export interface PasteButton {
  label: string;
  title?: string;
  disabled: boolean;
  onClick: () => void;
}

export function XmlPane({
  xml: text,
  dark = false,
  format = 'xml',
  paste,
  onCopied,
}: {
  xml: string;
  dark?: boolean;
  format?: 'xml' | 'json';
  /** A paste button next to the copy button. */
  paste?: PasteButton;
  /** Called with the text the copy button put on the clipboard. */
  onCopied?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const language = useRef(new Compartment());
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [basicSetup, language.current.of(format === 'json' ? json() : xml()), EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping, theme.current.of(dark ? oneDark : [])],
      }),
    });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(format === 'json' ? json() : xml()) });
  }, [format]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== text) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  }, [text]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex justify-end gap-2">
        {paste ? (
          <button
            type="button"
            disabled={paste.disabled}
            title={paste.title}
            className="rounded border border-fg bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
            onClick={paste.onClick}
          >
            {paste.label}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded bg-fg px-2 py-0.5 text-xs text-surface hover:opacity-80 focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              onCopied?.(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? t('copied') : format === 'json' ? t('copyJson') : t('copyXml')}
        </button>
      </div>
      <div ref={host} className="min-h-0 flex-1 overflow-auto rounded border border-edge text-xs" />
    </div>
  );
}
