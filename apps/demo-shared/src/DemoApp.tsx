import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { z } from 'zod';
import { APPLICATION_HEADER, areaIndex, evaluateRules, formatIssue, messageIndex, pruneEmpty, ruleCodeLists, withApplicationHeader, type MessageBundle, type RuleResult } from '@beneficial-strategies/iso20022-validate';
import { DescribedSelect, I18nProvider, Popup, SchemaForm, SkinProvider, skinIds, skins, useI18n, type FieldExtraContext, type FieldMode, type I18nOverrides, type UiKey, type UseForm } from '@beneficial-strategies/iso20022-react-ui';
import { serializeEnvelopeToIsoJson, serializeEnvelopeToXml, serializeFragment, serializeFragmentIsoJson, serializeToIsoJson, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import { XmlPane } from './XmlPane.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { useClipboard } from './clipboard.ts';
import { downloadText, readTextFile, saveFileName } from './files.ts';
import { AboutDialog, Banner } from './Banner.tsx';
import { ImplementDialog } from './ImplementDialog.tsx';
import { HEADER_IDENTIFIER, planPaste } from './paste.ts';
import { PasteReport, type PasteReportData, type TextSource } from './PasteReport.tsx';
import { useSettings, wantsImplementationBanner, type Format } from './settings.ts';
import { useXsd, type XsdHandle } from './useXsd.ts';
import { devProxyUrl, documentLineOffset, HEADER_LINE_OFFSET } from './xsd.ts';
import { XsdButton, XsdNotice, XsdPanel } from './XsdValidate.tsx';
import { zoomExtra } from './ZoomButton.tsx';
import { enterZoom, leaveZoom, type EditorValues, type ZoomFrame } from './zoom.ts';
import { FieldModeSwitch } from './FieldModeSwitch.tsx';
import { HoverHelp } from './HoverHelp.tsx';
import { DemoTextOverridesContext, demoText, useDemoText } from './demoText.ts';
import { HostCatalogContext, createHostI18n, mergeI18nOverrides, parseTextHosts, useHostText } from './textHost.ts';
import { CopyAsMenu } from './CopyAsMenu.tsx';
import { DEFAULT_OPTIONS, type ExportOptions } from './screenExport.ts';
import { PageTextOverridesContext, makePageText, usePageText, type PageKey } from './text/messages.ts';

const messageIds = messageIndex.map((m) => m.identifier);
const bundleCache = new Map<string, MessageBundle>();

/** Load a message on demand and remember it, so the app can show it as soon as it is selected. */
async function loadBundle(identifier: string): Promise<MessageBundle> {
  const cached = bundleCache.get(identifier);
  if (cached) return cached;
  const b = await messageIndex.find((m) => m.identifier === identifier)!.load();
  bundleCache.set(identifier, b);
  return b;
}

/** Load a message on demand (each message is its own chunk) and remember it. */
function useMessageBundle(identifier: string): MessageBundle | undefined {
  const [bundle, setBundle] = useState<MessageBundle | undefined>(() => bundleCache.get(identifier));
  useEffect(() => {
    const cached = bundleCache.get(identifier);
    if (cached) {
      setBundle(cached);
      return;
    }
    setBundle(undefined);
    let live = true;
    void messageIndex
      .find((m) => m.identifier === identifier)!
      .load()
      .then((b) => {
        bundleCache.set(identifier, b);
        if (live) setBundle(b);
      });
    return () => {
      live = false;
    };
  }, [identifier]);
  return bundle;
}

/** The first choice: which business area (pain, pacs, ...). Names and descriptions are the repository's, translated where we have it. */
function AreaPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { t } = usePageText();
  const dt = useDemoText();
  const host = useContext(HostCatalogContext);
  return (
    <HoverHelp className="w-[min(6.5rem,100%)] min-w-0 shrink-0" title={dt('helpAreaTitle')} text={dt('helpArea')}>
      <DescribedSelect
        id="area-picker"
        ariaLabel={t('areaLabel')}
        value={value}
        options={[...areaIndex].sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({
          value: a.code,
          label: a.code,
          // the area's name and description are ISO's: a text host has them in its language, else the specification's English
          description: [host?.areas[a.code]?.name ?? a.name, host?.areas[a.code]?.definition ?? a.definition].filter(Boolean).join(': '),
        }))}
        onChange={(v) => v && onChange(v)}
        placeholder={t('areaLabel')}
        allowEmpty={false}
      />
    </HoverHelp>
  );
}

/** The second choice: a message of the chosen area. */
function MessagePicker({ area, value, onChange }: { area: string; value: string; onChange: (id: string) => void }) {
  const { t } = usePageText();
  const dt = useDemoText();
  const host = useContext(HostCatalogContext);
  return (
    <HoverHelp className="w-[min(9rem,100%)] min-w-0 shrink-0" title={dt('helpMessageTitle')} text={dt('helpMessage')}>
      <DescribedSelect
        id="message-picker"
        ariaLabel={t('messageLabel')}
        value={value}
        options={messageIndex.filter((m) => m.area === area).map((m) => ({ value: m.identifier, label: m.identifier, description: host?.messages[m.identifier]?.name ?? m.title }))}
        onChange={(v) => v && onChange(v)}
        placeholder={t('messageLabel')}
        allowEmpty={false}
      />
    </HoverHelp>
  );
}

function TypePicker({ bundle, value, onChange }: { bundle: MessageBundle; value: string; onChange: (t: string) => void }) {
  const { t } = usePageText();
  const dt = useDemoText();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const messageType = bundle.message.rootType;
  const names = useMemo(() => [messageType, ...Object.keys(bundle.schemas).filter((n) => n !== messageType && bundle.typeDescriptors[n]?.kind === 'component').sort()], [bundle, messageType]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <HoverHelp className="w-[24rem] max-w-full min-w-0 shrink" title={dt('helpTypeTitle')} text={dt('helpType')}>
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('typeLabel')}${value}`}
        data-type-picker
        className="w-full rounded border border-edge bg-surface px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block truncate font-mono">{value}</span>
      </button>
      {open ? (
        <Popup ref={popup} anchor={trigger.current} width="anchor" minWidth={448} className="rounded border border-edge bg-surface text-fg shadow-lg">
          <Command label={t('findType')}>
            <Command.Input autoFocus placeholder={t('typeSearch')} className="w-full border-b border-line bg-surface px-3 py-2 text-sm text-fg outline-none" />
            <Command.List className="max-h-[min(18rem,50vh)] overflow-auto p-1">
              <Command.Empty className="px-3 py-2 text-sm text-muted">{t('noMatch')}</Command.Empty>
              {names.map((n) => (
                <Command.Item
                  key={n}
                  value={n}
                  className="cursor-pointer rounded px-3 py-1 font-mono text-xs aria-selected:bg-accent-soft"
                  onSelect={() => {
                    onChange(n);
                    setOpen(false);
                  }}
                >
                  {n}
                  {n === messageType ? <span className="ml-2 font-sans text-muted">{t('wholeMessage', { id: bundle.message.identifier })}</span> : null}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popup>
      ) : null}
    </div>
    </HoverHelp>
  );
}

const STATUS_STYLE: Record<RuleResult['status'], { icon: string; cls: string }> = {
  pass: { icon: '✓', cls: 'text-ok-fg' },
  fail: { icon: '✗', cls: 'text-danger' },
  unsupported: { icon: '!', cls: 'text-warn-fg' },
  'prose-only': { icon: '○', cls: 'text-muted' },
};

/** Rule prose in the page language, falling back to the English spec text. */
function RuleText({ r }: { r: RuleResult }) {
  const { defs } = useI18n();
  const d = defs.rule({ isoId: r.isoId }, r.text);
  return <span lang={d.lang}>{d.text}</span>;
}

function RulesPanel({ results }: { results: RuleResult[] }) {
  const { lang, validation, defs } = useI18n();
  const { t } = usePageText();
  if (results.length === 0) return null;
  const forms = results.map((r) => defs.rule({ isoId: r.isoId }, r.text));
  const ruleNotes = { english: forms.some((d) => d.lang !== lang), machine: forms.some((d) => d.lang === lang && d.status === 'machine') };
  const failed = results.filter((r) => r.status === 'fail');
  const count = (k: RuleResult['status']) => results.filter((r) => r.status === k).length;
  const counts = t('ruleCounts', {
    pass: count('pass'),
    fail: count('fail'),
    unsupported: count('unsupported'),
    prose: count('prose-only'),
    status_pass: t('status_pass'),
    status_fail: t('status_fail'),
    status_unsupported: t('status_unsupported'),
    status_prose: t('status_prose-only'),
  });
  return (
    <details className="mt-4 rounded border border-warn-line bg-warn-soft p-3 text-xs" open={failed.length > 0}>
      <summary className="cursor-pointer font-semibold text-warn-fg">
        {t('rulesTitle', { status: failed.length > 0 ? t('rulesViolated', { n: failed.length }) : t('rulesNoneViolated') })}{' '}
        <span className="font-normal">— {counts}</span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {results.map((r) => {
          const st = STATUS_STYLE[r.status];
          const label = t(`status_${r.status}` as PageKey);
          return (
            <li key={`${r.instancePath}:${r.rule}`} className="text-fg">
              <span className={`mr-1 font-bold ${st.cls}`} aria-hidden="true">{st.icon}</span>
              <span className="sr-only">{label}: </span>
              <span className="font-mono">{r.rule}</span>
              {r.instancePath ? <span className="text-muted"> @ {r.instancePath}</span> : null}: <RuleText r={r} />
              {r.reason ? <span className="text-warn-fg"> ({formatIssue(r.reason, validation)})</span> : null}
            </li>
          );
        })}
      </ul>
      {lang !== 'en' && ruleNotes.english ? <p className="mt-2 text-muted">{t('englishNote')}</p> : null}
      {lang !== 'en' && ruleNotes.machine ? <p className="mt-2 text-muted">{t('machineNote')}</p> : null}
    </details>
  );
}

/** Values pasted for a message that was not selected: carried across the switch, applied once the new editor is up. */
interface Incoming {
  identifier: string;
  typeName: string;
  values: unknown;
  /** What a paste or file load says about itself; a zoom has nothing to report. */
  report?: PasteReportData;
  /** Do not mark every field as touched (a zoom in or out is not a load, so no errors are shown that you have not earned). */
  quiet?: boolean;
}

function Editor({
  bundle,
  useForm,
  typeName,
  dark,
  format,
  incoming,
  onSwitch,
  onIncomingApplied,
  onZoom,
  valuesRef,
  xsd,
  headerBundle,
  headerXsd,
  copyOptions,
  onCopyOptions,
  modes,
  onMode,
  preview,
  onPreview,
}: {
  bundle: MessageBundle;
  useForm: UseForm;
  typeName: string;
  dark: boolean;
  format: Format;
  incoming?: Incoming | undefined;
  onSwitch: (incoming: Incoming) => void;
  onIncomingApplied: () => void;
  /** Show a component type on its own, starting with the values it has here (see zoom.ts). `outer` is this editor's values now. */
  onZoom: (type: string, path: string, outer: unknown) => void;
  /** Where the editor leaves its values (and what it started with), for coming back out of a zoom. */
  valuesRef: { current: EditorValues | undefined };
  /** The XSD of the chosen message (kept when only the type changes). */
  xsd: XsdHandle;
  /** The Business Application Header, offered as an optional group above the message's own (undefined while it loads). */
  headerBundle: MessageBundle | undefined;
  /** The header's own schema (checked beside the message's when the header is included). */
  headerXsd: XsdHandle;
  /** What the "Copy as" menu includes (kept when only the type changes). */
  copyOptions: ExportOptions;
  onCopyOptions: (o: ExportOptions) => void;
  /** How each element is presented, by `<message>|<type>|<path>` (anything missing is editable). */
  modes: Record<string, FieldMode>;
  onMode: (scope: string, path: string, mode: FieldMode) => void;
  /** Present elements as their mode says (labels as text, hidden ones left out); off: all editable, the others shaded. */
  preview: boolean;
  onPreview: (on: boolean) => void;
}) {
  const { validation } = useI18n();
  const { t } = usePageText();
  const demoT = useDemoText();
  // what sits beside the "i" (a zoom button, the field-mode switch) is the demo's own, not the form library's
  const modeScope = `${bundle.message.identifier}|${typeName}`;
  // zooming hands over this editor's values as they are at the click (a ref, so the zoom button's identity does not change with every key)
  const latest = useRef<unknown>(undefined);
  const zoomHere = useCallback((type: string, path: string) => onZoom(type, path, latest.current), [onZoom]);
  const fieldExtra = useMemo(() => {
    const zoom = zoomExtra(zoomHere);
    return (element: FieldExtraContext) => (
      <>
        {zoom(element)}
        <FieldModeSwitch element={element} mode={modes[`${modeScope}|${element.path}`] ?? 'editable'} onChange={(m) => onMode(modeScope, element.path, m)} />
      </>
    );
  }, [zoomHere, modes, modeScope, onMode]);
  const fieldMode = useMemo(() => (element: FieldExtraContext): FieldMode | undefined => modes[`${modeScope}|${element.path}`], [modes, modeScope]);
  const form = useForm({ schema: (bundle.schemas as Record<string, z.ZodType>)[typeName]!, typeDescriptors: bundle.typeDescriptors, rootType: typeName, messages: validation });
  latest.current = form.values;
  const startedWith = useRef(form.values);
  valuesRef.current = { current: form.values, initial: startedWith.current };
  const [submitted, setSubmitted] = useState(false);
  const [implementOpen, setImplementOpen] = useState(false);
  const clipboard = useClipboard();
  const [report, setReport] = useState<PasteReportData | undefined>(undefined);

  // a paste that named another message: its values arrive with the new editor
  useEffect(() => {
    if (!incoming) return;
    form.setValues(incoming.values);
    if (!incoming.quiet) form.touchAll();
    if (incoming.report) setReport(incoming.report);
    onIncomingApplied();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load XML or JSON text into the selected object (or, for XML naming another message, into that one).
   * The same path serves Paste and Load file; only the wording of the report differs.
   */
  const loadText = async (text: string, source: TextSource): Promise<void> => {
    const plan = await planPaste(text, { identifier: bundle.message.identifier, bundle, typeName }, loadBundle);
    if (!plan.ok) {
      setReport({ kind: 'error', error: plan.error, source });
      return;
    }
    const done: PasteReportData = {
      kind: 'done',
      format: plan.format,
      issues: plan.issues,
      source,
      ...(plan.target.identifier !== bundle.message.identifier ? { switchedTo: plan.target.identifier } : {}),
    };
    if (plan.switched) {
      onSwitch({ identifier: plan.target.identifier, typeName: plan.target.typeName, values: plan.values, report: done });
      return;
    }
    form.setValues(plan.values);
    lastHeader.current = undefined; // what the header held before is not what comes back after a load
    form.touchAll(); // show what is wrong with the loaded values right away
    setReport(done);
  };

  const doPaste = async (): Promise<void> => {
    const source: TextSource = { kind: 'clipboard' };
    let text: string;
    try {
      text = await clipboard.read();
    } catch {
      setReport({ kind: 'error', error: { code: 'clipboard_unreadable' }, source });
      return;
    }
    await loadText(text, source);
  };

  const doLoadFile = async (file: File): Promise<void> => {
    const source: TextSource = { kind: 'file', name: file.name };
    const read = await readTextFile(file);
    if (!read.ok) {
      setReport({ kind: 'error', error: { code: read.reason === 'too_large' ? 'file_too_large' : 'file_unreadable' }, source });
      return;
    }
    await loadText(read.text, source);
  };

  /** Save exactly what the pane shows, as XML or ISO JSON, whichever is selected. */
  const doSave = (): void => downloadText(saveFileName(bundle.message.identifier, typeName, bundle.message.rootType, format), output, format);
  const pasteLabel = clipboard.kind === 'xml' ? t('pasteXml') : clipboard.kind === 'json' ? t('pasteJson') : t('paste');
  const pasteTitle = clipboard.kind === 'none' ? t('pasteNoData') : clipboard.kind === 'blocked' ? t('pasteBlocked') : clipboard.kind === 'unknown' ? t('pasteUnknown') : undefined;
  // the header group (ticked) turns the output into an envelope holding the header and the message side by side
  const whole = typeName === bundle.message.rootType;
  const headerValues = whole && headerBundle ? (form.values as Record<string, unknown> | undefined)?.[APPLICATION_HEADER] : undefined;
  const withHeader = headerBundle !== undefined && headerValues !== undefined;
  // the header group remembers what it held while it is unticked, so that ticking it again brings that back; ticked fresh and still
  // empty, it gets what the message already says
  const headerSeen = useRef(false);
  const lastHeader = useRef<unknown>(undefined);
  if (headerValues !== undefined && headerSeen.current) lastHeader.current = headerValues;
  useEffect(() => {
    if (headerValues === undefined) {
      headerSeen.current = false;
      return;
    }
    if (headerSeen.current) return;
    headerSeen.current = true;
    if (pruneEmpty(headerValues) !== undefined) return;
    if (pruneEmpty(lastHeader.current) !== undefined) {
      form.setValues({ ...(form.values as Record<string, unknown>), [APPLICATION_HEADER]: lastHeader.current });
      return;
    }
    form.setValues({
      ...(form.values as Record<string, unknown>),
      [APPLICATION_HEADER]: { ...(headerValues as Record<string, unknown>), MessageDefinitionIdentifier: bundle.message.identifier, CreationDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerValues === undefined]);
  const output = useMemo(() => {
    if (format === 'json') {
      if (withHeader) return serializeEnvelopeToIsoJson({ message: headerBundle!.message, values: headerValues }, bundle.message, form.values);
      return whole ? serializeToIsoJson(bundle.message, form.values) : serializeFragmentIsoJson(bundle.typeDescriptors, typeName, form.values);
    }
    if (withHeader) return serializeEnvelopeToXml({ message: headerBundle!.message, values: headerValues }, bundle.message, form.values);
    return whole ? serializeToXml(bundle.message, form.values) : serializeFragment(bundle.typeDescriptors, typeName, form.values);
  }, [bundle, headerBundle, withHeader, headerValues, whole, form.values, typeName, format]);
  // XSD validation takes the message and the header as documents of their own; their lines are shifted to where the pane shows them
  const xsdParts = useMemo(() => {
    if (!withHeader) return undefined;
    const headerXml = serializeToXml(headerBundle!.message, headerValues);
    return { headerXml, documentXml: serializeToXml(bundle.message, form.values), documentOffset: documentLineOffset(headerXml) };
  }, [withHeader, headerBundle, headerValues, bundle, form.values]);
  const ruleResults = useMemo(
    () => evaluateRules({ types: bundle.typeDescriptors, codeLists: ruleCodeLists }, typeName, form.values),
    [bundle, form.values, typeName],
  );
  const failedRules = ruleResults.filter((r) => r.status === 'fail');
  const errorCount = Object.keys(form.allErrors).length + failedRules.length;
  const valid = form.isValid && failedRules.length === 0;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
      <div className="mb-2 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <CopyAsMenu
          form={form}
          identifier={bundle.message.identifier}
          options={copyOptions}
          onOptions={onCopyOptions}
          imageTarget={() => document.querySelector<HTMLElement>('[data-schema-form]')}
          fieldMode={fieldMode}
          fileStem={saveFileName(bundle.message.identifier, typeName, bundle.message.rootType, 'xml').replace(/\.xml$/, '')}
        />
        <label className="flex items-center gap-2 text-sm" title={demoT('previewTitle')}>
          <input type="checkbox" data-preview-as-designed checked={preview} onChange={(e) => onPreview(e.target.checked)} />
          {demoT('previewAsDesigned')}
        </label>
        </div>
      </div>
      <section className="min-h-0 flex-1 overflow-auto pr-2" aria-label="Form" data-form-area>
        <SchemaForm form={form} fieldExtra={fieldExtra} fieldMode={fieldMode} fieldModeView={preview ? 'apply' : 'mark'} />
        <RulesPanel results={ruleResults} />
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="rounded bg-ok px-3 py-1.5 text-sm text-accent-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => {
              form.touchAll();
              setSubmitted(true);
            }}
          >
            {t('doneEditing')}
          </button>
          <button
            type="button"
            className="rounded border border-accent bg-surface px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => setImplementOpen(true)}
          >
            {t('implement')}
          </button>
          {submitted ? <span className="text-sm text-muted">{valid ? t('looksComplete') : t('problemsRemain', { n: errorCount })}</span> : null}
          {implementOpen ? (
            <ImplementDialog
              type={typeName}
              isMessageRoot={typeName === bundle.message.rootType}
              module={messageIndex.find((m) => m.identifier === bundle.message.identifier)?.module ?? ''}
              onClose={() => setImplementOpen(false)}
            />
          ) : null}
        </div>
      </section>
      </div>
      <section className="flex min-h-0 flex-col" aria-label="XML preview">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <span className="font-semibold">{t(`format_${format}`)}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs ${valid ? 'bg-ok-soft text-ok-fg' : 'bg-warn-soft text-warn-fg'}`}
            role="status"
          >
            {valid ? t('valid') : t('draft', { n: errorCount })}
          </span>
        </div>
        {report ? <PasteReport report={report} onDismiss={() => setReport(undefined)} /> : null}
        <div className="min-h-0 flex-1">
          <XmlPane
            xml={output}
            dark={dark}
            format={format}
            onCopied={clipboard.noteCopied}
            leading={<XsdButton xsd={xsd} xmlOutput={format === 'xml'} />}
            below={
              <>
                <XsdNotice xsd={xsd} />
                <XsdPanel
                  xsd={xsd}
                  request={{
                    xml: xsdParts ? xsdParts.documentXml : output,
                    namespace: bundle.message.namespace,
                    type: typeName,
                    isMessage: typeName === bundle.message.rootType,
                    ...(xsdParts && headerBundle
                      ? {
                          lineOffset: xsdParts.documentOffset,
                          header: { xml: xsdParts.headerXml, namespace: headerBundle.message.namespace, schema: headerXsd.state.status === 'ready' ? headerXsd.state.text : undefined, lineOffset: HEADER_LINE_OFFSET },
                        }
                      : {}),
                  }}
                />
              </>
            }
            load={{ label: t('loadFile'), onFile: (f) => void doLoadFile(f) }}
            save={{ label: t(format === 'json' ? 'saveJson' : 'saveXml'), onClick: doSave }}
            paste={{ label: pasteLabel, ...(pasteTitle ? { title: pasteTitle } : {}), disabled: clipboard.kind === 'none' || clipboard.kind === 'blocked', onClick: () => void doPaste() }}
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Whether the page's own site passes ISO's schemas through (`/iso20022-xsd/...`): the dev server does, unless
 * VITE_XSD_PROXY=off; a deployed build asks for it with VITE_XSD_PROXY=on (the Message Explorer's Cloudflare Worker, which lives in the private iso-20022-explorer repository).
 */
const viteEnv = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
const DEV_XSD_PROXY = viteEnv?.VITE_XSD_PROXY === 'on' || (viteEnv?.DEV === true && viteEnv.VITE_XSD_PROXY !== 'off');

/**
 * `variant` picks the title/blurb. `i18n` overrides interface text, validation messages and
 * spec text per locale (keep the object stable, e.g. define it outside the component).
 */
export function DemoApp({ variant, useForm, i18n: overrides }: { variant: 'form' | 'zod'; useForm: UseForm; i18n?: I18nOverrides }) {
  // where each language's text comes from, if the address says so (?textHosts=... or ?textHost=...): see textHost.ts
  const hostConfig = useMemo(
    () => parseTextHosts(typeof window === 'undefined' ? '' : window.location.search, undefined, { textHosts: viteEnv?.VITE_TEXT_HOSTS as string | undefined, textHost: viteEnv?.VITE_TEXT_HOST as string | undefined, textLangs: viteEnv?.VITE_TEXT_LANGS as string | undefined }),
    [],
  );
  // English is all the Explorer carries; every other language is one a text host (or the embedding page) supplies
  const locales = useMemo(() => [...new Set(['en', ...Object.keys(overrides?.ui ?? {}), ...hostConfig.languages])], [overrides, hostConfig]);
  const { settings, resolvedTheme, locale, update } = useSettings(skinIds, locales, messageIds);
  // ?ImplementationBanner=true brings back the original banner; the settings code keeps unknown query parameters
  const implementationBanner = useMemo(() => (typeof window === 'undefined' ? false : wantsImplementationBanner(window.location.search)), []);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [copyOptions, setCopyOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  // how elements are presented (field mode), and whether the form shows them that way; kept while only the type changes
  const [modes, setModes] = useState<Record<string, FieldMode>>({});
  const [preview, setPreview] = useState(false);
  const setMode = useCallback((scope: string, path: string, mode: FieldMode) => {
    setModes((cur) => {
      const next = { ...cur };
      if (mode === 'editable') delete next[`${scope}|${path}`];
      else next[`${scope}|${path}`] = mode;
      return next;
    });
  }, []);
  const plainBundle = useMessageBundle(settings.message);
  const headerBundle = useMessageBundle(HEADER_IDENTIFIER);
  // every message but the header itself offers the header as an optional group above its own
  const bundle = useMemo(
    () => (plainBundle && headerBundle && plainBundle.message.identifier !== HEADER_IDENTIFIER ? withApplicationHeader(plainBundle, headerBundle) : plainBundle),
    [plainBundle, headerBundle],
  );
  const messageInfo = messageIndex.find((m) => m.identifier === settings.message);
  // the schema belongs to the message: choosing another message (not just another type of it) starts over
  const proxyUrl = DEV_XSD_PROXY ? devProxyUrl(messageInfo?.xsdUrl ?? '') : undefined;
  const xsd = useXsd(messageInfo && bundle && bundle.message.identifier === messageInfo.identifier ? { identifier: messageInfo.identifier, xsdUrl: messageInfo.xsdUrl, namespace: bundle.message.namespace, proxyUrl } : undefined);
  const headerInfo = messageIndex.find((m) => m.identifier === HEADER_IDENTIFIER);
  const headerXsd = useXsd(headerInfo && headerBundle ? { identifier: headerInfo.identifier, xsdUrl: headerInfo.xsdUrl, namespace: headerBundle.message.namespace, proxyUrl: DEV_XSD_PROXY ? devProxyUrl(headerInfo.xsdUrl) : undefined } : undefined);
  const [chosenType, setChosenType] = useState<{ message: string; type: string } | undefined>();
  // a type chosen for another message does not apply here: fall back to the whole message
  const typeName = bundle && chosenType?.message === settings.message && bundle.typeDescriptors[chosenType.type] ? chosenType.type : bundle?.message.rootType;
  const [incoming, setIncoming] = useState<Incoming | undefined>(undefined);
  // where zooms came from, so that picking an outer type again brings its values back (see zoom.ts)
  const [zoomStack, setZoomStack] = useState<ZoomFrame[]>([]);
  const editorValues = useRef<EditorValues | undefined>(undefined);
  const chooseType = (type: string): void => {
    if (type === typeName) return;
    const back = leaveZoom(zoomStack.filter((f) => f.message === settings.message), type, editorValues.current);
    if (back) setIncoming({ identifier: settings.message, typeName: type, values: back.values, quiet: true });
    setZoomStack(back ? back.stack : []);
    setChosenType({ message: settings.message, type });
  };
  const zoomInto = (type: string, path: string, outer: unknown): void => {
    const { frame, start } = enterZoom(settings.message, typeName!, outer, path);
    setZoomStack((stack) => [...stack.filter((f) => f.message === settings.message), frame]);
    if (start !== undefined) setIncoming({ identifier: settings.message, typeName: type, values: start, quiet: true });
    setChosenType({ message: settings.message, type });
  };
  // the area follows the message (a URL, a paste or a file can change the message); switching back to an area returns to its last message
  const area = messageIndex.find((m) => m.identifier === settings.message)?.area ?? areaIndex[0]!.code;
  const lastInArea = useRef<Record<string, string>>({});
  lastInArea.current[area] = settings.message;
  const hostText = useHostText(hostConfig, locale, bundle?.typeDescriptors);
  // the host's text is the base; what the embedding page passes as `i18n` still wins over it
  const merged = useMemo(() => mergeI18nOverrides(hostText?.i18n, overrides), [hostText, overrides]);
  const i18n = useMemo(() => createHostI18n(locale, merged), [locale, merged]);
  const dt = demoText(i18n.locale, hostText?.controls);
  const pagePerLocale = useMemo(() => (hostText ? { [locale]: hostText.page } : undefined), [hostText, locale]);
  const pageText = useMemo(() => makePageText(i18n, pagePerLocale), [i18n, pagePerLocale]);
  const skin = skins.find((s) => s.id === settings.skin) ?? skins[0]!;
  return (
    <I18nProvider value={i18n}>
     <PageTextOverridesContext.Provider value={pagePerLocale}>
      <DemoTextOverridesContext.Provider value={hostText?.controls}>
      <HostCatalogContext.Provider value={hostText?.catalog}>
      <div className="flex h-screen flex-col bg-surface p-4 text-fg">
        <header className="mb-3">
          {implementationBanner ? (
            <div className="-mx-4 -mt-4 mb-3 border-b border-bar-from bg-linear-to-r from-bar-from to-bar-to px-4 py-3 shadow-md">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h1 className="text-xl font-bold tracking-tight text-bar-fg">{pageText.t(`title_${variant}` as PageKey)}</h1>
                <p className="min-w-0 max-w-2xl text-xs text-bar-muted sm:text-right">{pageText.t(`blurb_${variant}` as PageKey)}</p>
              </div>
            </div>
          ) : (
            <Banner onAbout={() => setAboutOpen(true)} />
          )}
          <div className="flex min-w-0 flex-wrap items-end justify-start gap-2 sm:flex-nowrap sm:justify-end">
            <AreaPicker value={area} onChange={(code) => update({ message: lastInArea.current[code] ?? messageIndex.find((m) => m.area === code)!.identifier })} />
            <MessagePicker area={area} value={settings.message} onChange={(message) => update({ message })} />
            {bundle && typeName ? <TypePicker bundle={bundle} value={typeName} onChange={chooseType} /> : null}
            <HoverHelp className="shrink-0" title={dt('helpDisplayTitle')} text={dt('helpDisplay')}>
              <SettingsPanel settings={settings} skins={skins} locales={locales} locale={locale} onChange={update} />
            </HoverHelp>
          </div>
        </header>
        {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
        <SkinProvider value={skin}>
          {bundle && headerBundle && typeName ? (
            <Editor
              key={`${settings.message}/${typeName}`}
              bundle={bundle}
              useForm={useForm}
              typeName={typeName}
              dark={resolvedTheme === 'dark'}
              format={settings.format}
              incoming={incoming && incoming.identifier === settings.message && incoming.typeName === typeName ? incoming : undefined}
              onSwitch={(next) => {
                setIncoming(next);
                setZoomStack([]);
                setChosenType({ message: next.identifier, type: next.typeName });
                update({ message: next.identifier });
              }}
              onIncomingApplied={() => setIncoming(undefined)}
              onZoom={zoomInto}
              valuesRef={editorValues}
              xsd={xsd}
              headerBundle={plainBundle?.message.identifier === HEADER_IDENTIFIER ? undefined : headerBundle}
              headerXsd={headerXsd}
              copyOptions={copyOptions}
              onCopyOptions={setCopyOptions}
              modes={modes}
              onMode={setMode}
              preview={preview}
              onPreview={setPreview}
            />
          ) : (
            <p className="text-sm text-muted" role="status">
              {pageText.t('loading')}
            </p>
          )}
        </SkinProvider>
      </div>
      </HostCatalogContext.Provider>
      </DemoTextOverridesContext.Provider>
     </PageTextOverridesContext.Provider>
    </I18nProvider>
  );
}
