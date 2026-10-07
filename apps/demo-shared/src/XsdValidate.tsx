import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@beneficial-strategies/iso20022-react-ui';
import type { XsdHandle } from './useXsd.ts';
import { validateXsd, type ValidateXml, type XsdResult } from './xsd.ts';

const BUTTON =
  'rounded border border-fg bg-surface px-2 py-0.5 text-xs text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface';

/**
 * "XSD Validate": enabled once the message's schema is loaded; its hover text says where the schema is, or where it was
 * looked for. When it cannot be enabled, a right-click (or the menu key) loads the schema from a local file. The button
 * is `aria-disabled` rather than `disabled` so that it still shows its hover text, takes focus and receives the right-click.
 */
export function XsdButton({ xsd, xmlOutput }: { xsd: XsdHandle; xmlOutput: boolean }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const { state } = xsd;
  const ready = state.status === 'ready' && xmlOutput;
  const title = !xmlOutput
    ? t('xsdNeedsXml')
    : state.status === 'ready'
      ? state.source === 'file'
        ? t('xsdReadyFile', { file: state.fileName ?? '' })
        : t('xsdReady', { location: state.url })
      : state.status === 'loading'
        ? t('xsdLoading', { url: state.url })
        : t('xsdUnavailable', { url: state.url });
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xsd,.xml,application/xml,text/xml"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('xsdLoadOther')}
        data-load-schema
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void xsd.loadFile(file);
        }}
      />
      <button
        type="button"
        aria-disabled={!ready}
        title={title}
        data-xsd-state={ready ? 'ready' : state.status === 'ready' ? 'xml-only' : state.status}
        className={BUTTON}
        onClick={() => {
          if (ready) xsd.setOpen(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          input.current?.click();
        }}
      >
        {t('xsdLabel')}
      </button>
    </>
  );
}

/** What the message of a validation looks like to the person. */
export interface XsdRequest {
  xml: string;
  namespace: string;
  type: string;
  isMessage: boolean;
}

/**
 * The "Validation Errors" window under the XML: the schema's complaints about the XML, refreshed as the XML changes, so
 * errors disappear as they are corrected.
 */
export function XsdPanel({ xsd, request, validate }: { xsd: XsdHandle; request: XsdRequest; validate?: ValidateXml }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<XsdResult | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const schema = xsd.state.status === 'ready' ? xsd.state : undefined;
  const { xml, namespace, type, isMessage } = request;

  useEffect(() => {
    if (!xsd.open || !schema) return;
    let stale = false;
    setChecking(true);
    // a short pause, so that typing does not start a check per key
    const timer = setTimeout(() => {
      validateXsd({ xml, schema: schema.text, namespace, type, isMessage }, validate)
        .then((r) => {
          if (stale) return;
          setResult(r);
          setFailure(undefined);
        })
        .catch((e: unknown) => {
          if (!stale) setFailure(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!stale) setChecking(false);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [xsd.open, schema, xml, namespace, type, isMessage, validate]);

  if (!xsd.open || !schema) return null;
  const source = schema.source === 'file' ? (schema.fileName ?? '') : schema.url;
  const count = result?.issues.length ?? 0;
  return (
    <section aria-label={t('xsdPanelTitle')} data-xsd-panel className="mt-2 max-h-[30%] min-h-0 shrink-0 overflow-auto rounded border border-edge bg-surface text-xs text-fg">
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-surface-alt px-2 py-1">
        <h3 className="font-semibold">
          {t('xsdPanelTitle')}
          {result && !failure ? (
            <span className={`ml-2 font-normal ${result.valid ? 'text-ok-fg' : 'text-danger'}`} data-xsd-count>
              {result.valid ? '✓' : count === 1 ? t('xsdOneError') : t('xsdErrors', { n: count })}
            </span>
          ) : null}
          {checking ? <span className="ml-2 font-normal text-muted">{t('xsdChecking')}</span> : null}
        </h3>
        <div className="flex items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xsd,.xml,application/xml,text/xml"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('xsdLoadOther')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void xsd.loadFile(file);
            }}
          />
          <button type="button" className="text-accent underline hover:no-underline focus-visible:ring-2 focus-visible:ring-focus" onClick={() => input.current?.click()}>
            {t('xsdLoadOther')}
          </button>
          <button
            type="button"
            aria-label={t('xsdClose')}
            title={t('xsdClose')}
            className="rounded px-1.5 text-base leading-none hover:bg-line focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => xsd.setOpen(false)}
          >
            ×
          </button>
        </div>
      </div>
      <div className="px-2 py-1">
        <p className="truncate text-muted" title={source}>
          {t('xsdSchemaFrom', { source })}
        </p>
        {failure ? <p role="alert" className="text-danger">{t('xsdEngineFailed', { why: failure })}</p> : null}
        {!failure && result?.valid ? <p className="text-ok-fg">{t('xsdValid')}</p> : null}
        {!failure && result && !result.valid ? (
          <ul className="mt-1 space-y-1" role="list">
            {result.issues.map((issue, i) => (
              <li key={`${i}-${issue.line ?? ''}-${issue.message}`} className="flex gap-2">
                {issue.line ? <span className="shrink-0 font-mono text-muted">{t('xsdLine', { n: issue.line })}</span> : null}
                <span className="min-w-0 break-words text-danger">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** A schema file that was not used, and why. Gone when a good file is loaded or another message is chosen. */
export function XsdNotice({ xsd }: { xsd: XsdHandle }) {
  const { t } = useI18n();
  if (!xsd.notice) return null;
  return (
    <p role="alert" data-xsd-notice className="mt-1 text-xs text-danger">
      {t(xsd.notice.key, xsd.notice.params)}
    </p>
  );
}
