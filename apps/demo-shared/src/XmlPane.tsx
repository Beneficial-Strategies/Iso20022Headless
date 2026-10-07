import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/** "Load file…": a button that opens the file chooser and hands the chosen file back. */
export interface LoadButton {
  label: string;
  onFile: (file: File) => void;
}

/** "Save XML" / "Save JSON": hands the shown text to the browser as a file. */
export interface SaveButton {
  label: string;
  onClick: () => void;
}

export function XmlPane({
  xml: text,
  dark = false,
  format = 'xml',
  paste,
  load,
  save,
  leading,
  below,
  onCopied,
}: {
  xml: string;
  dark?: boolean;
  format?: 'xml' | 'json';
  /** A paste button next to the copy button. */
  paste?: PasteButton;
  load?: LoadButton;
  save?: SaveButton;
  /** Buttons before the others (left of "Load file…"). */
  leading?: ReactNode;
  /** Content under the XML, such as a validation window. */
  below?: ReactNode;
  /** Called with the text the copy button put on the clipboard. */
  onCopied?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const language = useRef(new Compartment());
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
      <div className="mb-1 flex flex-wrap justify-end gap-2">
        {leading}
        {load ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".xml,.json,application/xml,text/xml,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-label={load.label}
              data-load-file
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ''; // choosing the same file again must still fire
                if (file) load.onFile(file);
              }}
            />
            <button
              type="button"
              className="rounded border border-fg bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
              onClick={() => fileInput.current?.click()}
            >
              {load.label}
            </button>
          </>
        ) : null}
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
        {save ? (
          <button
            type="button"
            className="rounded border border-fg bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
            onClick={save.onClick}
          >
            {save.label}
          </button>
        ) : null}
      </div>
      <div ref={host} className="min-h-0 flex-1 overflow-auto rounded border border-edge text-xs" />
      {below}
    </div>
  );
}
