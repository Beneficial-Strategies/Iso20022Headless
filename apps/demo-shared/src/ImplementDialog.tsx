import { useEffect, useMemo, useRef, useState } from 'react';
import { type UiKey } from '@beneficial-strategies/iso20022-react-ui';
import { buildInstructions, type PackageManager, type Snippet } from './instructions.ts';
import { usePageText, type PageKey } from './text/messages.ts';

function CopyButton({ text }: { text: string }) {
  const { t } = usePageText();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-edge bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? t('copiedShort') : t('copy')}
    </button>
  );
}

function CodeBlock({ snippet }: { snippet: Snippet }) {
  return (
    <div className="mt-2 overflow-hidden rounded border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-alt px-2 py-1 text-xs text-muted">
        <span className="font-mono">{snippet.file ?? snippet.lang}</span>
        <CopyButton text={snippet.code} />
      </div>
      <pre className="overflow-auto bg-surface p-3 text-xs leading-relaxed text-fg">
        <code>{snippet.code}</code>
      </pre>
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/**
 * "Implement!": pick your stack, get the steps to add the type being edited to an existing app.
 * Instructions only (see instructions.ts); the quickstart apps prove the React ones work.
 */
export function ImplementDialog({ type, isMessageRoot, module, onClose }: { type: string; isMessageRoot: boolean; module: string; onClose: () => void }) {
  const { t } = usePageText();
  const dialog = useRef<HTMLDialogElement>(null);
  const [react, setReact] = useState(true);
  const [vue, setVue] = useState(false);
  const [svelte, setSvelte] = useState(false);
  const [other, setOther] = useState(false);
  const [tailwind, setTailwind] = useState(false);
  const [output, setOutput] = useState(false);
  const [packageManager, setPackageManager] = useState<PackageManager>('npm');

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    if (d && !d.showModal) d.setAttribute('open', '');
  }, []);

  const steps = useMemo(
    () => buildInstructions({ type, isMessageRoot, module, react, vue, svelte, other, tailwind, output, packageManager }),
    [type, isMessageRoot, module, react, vue, svelte, other, tailwind, output, packageManager],
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="implement-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto max-h-[90vh] w-[min(52rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line bg-surface-alt px-4 py-3">
        <div>
          <h2 id="implement-title" className="text-lg font-bold">
            {t('implementTitle')}
          </h2>
          <p className="text-sm text-muted">{t('implementIntro', { type })}</p>
        </div>
        <button
          type="button"
          className="rounded border border-edge bg-surface px-3 py-1 text-sm hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => dialog.current?.close()}
        >
          {t('close')}
        </button>
      </div>
      <div className="max-h-[calc(90vh-5rem)] overflow-auto px-4 py-3">
        <p className="rounded border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-fg" role="note">
          {t('implementUnpublished')}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-semibold">{t('stackLabel')}</legend>
            <Check checked={react} onChange={setReact}>{t('stackReact')}</Check>
            <Check checked={vue} onChange={setVue}>{t('stackVue')}</Check>
            <Check checked={svelte} onChange={setSvelte}>{t('stackSvelte')}</Check>
            <Check checked={other} onChange={setOther}>{t('stackOther')}</Check>
          </fieldset>
          <div className="space-y-3">
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-semibold">{t('stylingLabel')}</legend>
              <Check checked={tailwind} onChange={setTailwind}>{t('stylingTailwind')}</Check>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-semibold">{t('extrasLabel')}</legend>
              <Check checked={output} onChange={setOutput}>{t('extrasOutput')}</Check>
            </fieldset>
            <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <legend className="mb-1 text-sm font-semibold">{t('pmLabel')}</legend>
              {(['npm', 'pnpm', 'yarn'] as const).map((pm) => (
                <label key={pm} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="package-manager" checked={packageManager === pm} onChange={() => setPackageManager(pm)} />
                  {pm}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
        <div className="mt-4 space-y-5">
          {steps.length === 0 ? <p className="text-sm text-muted">{t('pickStack')}</p> : null}
          {steps.map((s, i) => (
            <section key={`${s.title}-${i}`} aria-label={t(s.title as PageKey)}>
              <h3 className="font-semibold">{t(s.title as PageKey)}</h3>
              {s.note ? <p className="text-sm text-muted">{t(s.note as PageKey)}</p> : null}
              {s.snippets.map((sn, j) => (
                <CodeBlock key={j} snippet={sn} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
