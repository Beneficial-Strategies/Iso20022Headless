import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Popup, useI18n, type FormApi } from '@beneficial-strategies/iso20022-react-ui';
import { copyPng, copyRich, copyText, elementToPng, type CopyResult } from './copyOut.ts';
import { useDemoText, type DemoKey } from './demoText.ts';
import { toHtml, toJson, toMarkdown, toOutline, toTsv, type ExportOptions } from './screenExport.ts';
import { buildScreenModel } from './screenModel.ts';

type Format = 'word' | 'markdown' | 'spreadsheet' | 'outline' | 'json' | 'image';

const FORMATS: { id: Format; label: DemoKey; description: DemoKey }[] = [
  { id: 'word', label: 'fmtWord', description: 'fmtWordDesc' },
  { id: 'markdown', label: 'fmtMarkdown', description: 'fmtMarkdownDesc' },
  { id: 'spreadsheet', label: 'fmtSpreadsheet', description: 'fmtSpreadsheetDesc' },
  { id: 'outline', label: 'fmtOutline', description: 'fmtOutlineDesc' },
  { id: 'json', label: 'fmtJson', description: 'fmtJsonDesc' },
  { id: 'image', label: 'fmtImage', description: 'fmtImageDesc' },
];

const ITEM = 'block w-full rounded px-2 py-1.5 text-left hover:bg-accent-soft focus:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * "Copy as ▾": copies what the form shows now (which optional sections are included, what is filled in) in a format for a
 * document or a tool. Imposed on the form from outside: the form library knows nothing about it.
 */
export function CopyAsMenu({
  form,
  identifier,
  options,
  onOptions,
  imageTarget,
  fileStem,
}: {
  form: FormApi;
  identifier: string;
  options: ExportOptions;
  onOptions: (o: ExportOptions) => void;
  /** The element a picture is made of (the form as shown). */
  imageTarget: () => HTMLElement | null;
  /** The start of a file name, for the browsers that cannot copy a picture and save it instead. */
  fileStem: string;
}) {
  const { defs } = useI18n();
  const t = useDemoText();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | undefined>();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // the popup is placed a moment after it appears, and a hidden element cannot take focus: wait until it is shown
    const focusFirst = setInterval(() => {
      const first = popup.current?.querySelector<HTMLElement>('[role=menuitem]');
      first?.focus();
      if (first && document.activeElement === first) clearInterval(focusFirst);
    }, 20);
    const giveUp = setTimeout(() => clearInterval(focusFirst), 600);
    return () => {
      document.removeEventListener('mousedown', onDown);
      clearInterval(focusFirst);
      clearTimeout(giveUp);
    };
  }, [open]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(undefined), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const run = async (format: Format): Promise<void> => {
    const name = t(FORMATS.find((f) => f.id === format)!.label);
    setOpen(false);
    button.current?.focus();
    let result: CopyResult;
    try {
      const model = buildScreenModel(form, defs, { identifier });
      if (format === 'image') {
        const target = imageTarget();
        if (!target) throw new Error('the form is not on screen');
        result = await copyPng(await elementToPng(target), `${fileStem}.png`);
      } else if (format === 'word') result = await copyRich(toHtml(model, t, options), toOutline(model, t, options));
      else if (format === 'markdown') result = await copyText(toMarkdown(model, t, options));
      else if (format === 'spreadsheet') result = await copyText(toTsv(model, t, options));
      else if (format === 'outline') result = await copyText(toOutline(model, t, options));
      else result = await copyText(toJson(model, options));
    } catch (e) {
      result = { ok: false, why: e instanceof Error ? e.message : String(e) };
    }
    setStatus(result.ok ? { text: t(result.how === 'download' ? 'copiedDownload' : 'copied', { format: name }), ok: true } : { text: t('copyFailed', { why: result.why }), ok: false });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key === 'Tab') return setOpen(false);
    const items = [...(popup.current?.querySelectorAll<HTMLElement>('[role=menuitem], [role=menuitemcheckbox]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
  };

  return (
    <div ref={root} className="relative flex items-center gap-3">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={t('copyAsTitle')}
        data-copy-as
        className="whitespace-nowrap rounded border border-edge bg-surface px-3 py-1 text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        {t('copyAs')} ▾
      </button>
      <span role="status" aria-live="polite" data-copy-status className={`text-xs ${status && !status.ok ? 'text-danger' : 'text-ok-fg'}`}>
        {status?.text ?? ''}
      </span>
      {open ? (
        <Popup ref={popup} anchor={button.current} id={id} role="menu" label={t('copyAsMenu')} width={360} className="rounded border border-edge bg-surface p-1 text-sm text-fg shadow-lg">
          <div onKeyDown={onKeyDown}>
            {FORMATS.map((f) => (
              <button key={f.id} type="button" role="menuitem" data-format={f.id} className={ITEM} onClick={() => void run(f.id)}>
                <span className="block font-medium">{t(f.label)}</span>
                <span className="block text-xs text-muted">{t(f.description)}</span>
              </button>
            ))}
            <div role="separator" className="my-1 border-t border-line" />
            <button type="button" role="menuitemcheckbox" aria-checked={options.definitions} data-option="definitions" className={`${ITEM} flex items-center gap-2`} onClick={() => onOptions({ ...options, definitions: !options.definitions })}>
              <span aria-hidden="true" className="inline-block w-4 text-center">{options.definitions ? '☑' : '☐'}</span>
              {t('optDefinitions')}
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={options.excluded} data-option="excluded" className={`${ITEM} flex items-center gap-2`} onClick={() => onOptions({ ...options, excluded: !options.excluded })}>
              <span aria-hidden="true" className="inline-block w-4 text-center">{options.excluded ? '☑' : '☐'}</span>
              {t('optExcluded')}
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={options.emptyOptional} data-option="emptyOptional" className={`${ITEM} flex items-center gap-2`} onClick={() => onOptions({ ...options, emptyOptional: !options.emptyOptional })}>
              <span aria-hidden="true" className="inline-block w-4 text-center">{options.emptyOptional ? '☑' : '☐'}</span>
              {t('optEmpty')}
            </button>
          </div>
        </Popup>
      ) : null}
    </div>
  );
}
