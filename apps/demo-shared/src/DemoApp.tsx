import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { z } from 'zod';
import { areaIndex, evaluateRules, formatIssue, messageIndex, ruleCodeLists, type MessageBundle, type RuleResult } from '@beneficial-strategies/iso20022-validate';
import { DescribedSelect, I18nProvider, Popup, SchemaForm, SkinProvider, skinIds, skins, supportedLocales, useCreateI18n, useI18n, type I18nOverrides, type UiKey, type UseForm } from '@beneficial-strategies/iso20022-react-ui';
import { serializeFragment, serializeFragmentIsoJson, serializeToIsoJson, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import { XmlPane } from './XmlPane.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { useClipboard } from './clipboard.ts';
import { downloadText, readTextFile, saveFileName } from './files.ts';
import { ImplementDialog } from './ImplementDialog.tsx';
import { planPaste } from './paste.ts';
import { PasteReport, type PasteReportData, type TextSource } from './PasteReport.tsx';
import { useSettings, type Format } from './settings.ts';

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
  const { t, lang } = useI18n();
  return (
    <div className="w-[min(6.5rem,100%)] min-w-0 shrink-0">
      <DescribedSelect
        id="area-picker"
        ariaLabel={t('areaLabel')}
        value={value}
        options={areaIndex.map((a) => ({
          value: a.code,
          label: a.code,
          description: lang === 'en' ? `${a.name}: ${a.definition}` : `${t(`areaName_${a.code}` as UiKey)}: ${t(`areaDesc_${a.code}` as UiKey)}`,
        }))}
        onChange={(v) => v && onChange(v)}
        placeholder={t('areaLabel')}
        allowEmpty={false}
      />
    </div>
  );
}

/** The second choice: a message of the chosen area. */
function MessagePicker({ area, value, onChange }: { area: string; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="w-[min(9rem,100%)] min-w-0 shrink-0">
      <DescribedSelect
        id="message-picker"
        ariaLabel={t('messageLabel')}
        value={value}
        options={messageIndex.filter((m) => m.area === area).map((m) => ({ value: m.identifier, label: m.identifier, description: m.title }))}
        onChange={(v) => v && onChange(v)}
        placeholder={t('messageLabel')}
        allowEmpty={false}
      />
    </div>
  );
}

function TypePicker({ bundle, value, onChange }: { bundle: MessageBundle; value: string; onChange: (t: string) => void }) {
  const { t } = useI18n();
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
    <div
      ref={root}
      className="relative w-[34rem] max-w-full min-w-0 shrink"
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
        title={value}
        className="w-full rounded border border-edge bg-surface px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block truncate">
          <span className="text-muted">{t('typeLabel')}</span>
          <span className="font-mono">{value}</span>
        </span>
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
  const { t, lang, validation, defs } = useI18n();
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
          const label = t(`status_${r.status}` as UiKey);
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
  report: PasteReportData;
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
}: {
  bundle: MessageBundle;
  useForm: UseForm;
  typeName: string;
  dark: boolean;
  format: Format;
  incoming?: Incoming | undefined;
  onSwitch: (incoming: Incoming) => void;
  onIncomingApplied: () => void;
}) {
  const { t, validation } = useI18n();
  const form = useForm({ schema: (bundle.schemas as Record<string, z.ZodType>)[typeName]!, typeDescriptors: bundle.typeDescriptors, rootType: typeName, messages: validation });
  const [submitted, setSubmitted] = useState(false);
  const [implementOpen, setImplementOpen] = useState(false);
  const clipboard = useClipboard();
  const [report, setReport] = useState<PasteReportData | undefined>(undefined);

  // a paste that named another message: its values arrive with the new editor
  useEffect(() => {
    if (!incoming) return;
    form.setValues(incoming.values);
    form.touchAll();
    setReport(incoming.report);
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
  const output = useMemo(() => {
    const whole = typeName === bundle.message.rootType;
    if (format === 'json') {
      return whole ? serializeToIsoJson(bundle.message, form.values) : serializeFragmentIsoJson(bundle.typeDescriptors, typeName, form.values);
    }
    return whole ? serializeToXml(bundle.message, form.values) : serializeFragment(bundle.typeDescriptors, typeName, form.values);
  }, [bundle, form.values, typeName, format]);
  const ruleResults = useMemo(
    () => evaluateRules({ types: bundle.typeDescriptors, codeLists: ruleCodeLists }, typeName, form.values),
    [bundle, form.values, typeName],
  );
  const failedRules = ruleResults.filter((r) => r.status === 'fail');
  const errorCount = Object.keys(form.allErrors).length + failedRules.length;
  const valid = form.isValid && failedRules.length === 0;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="min-h-0 overflow-auto pr-2" aria-label="Form" data-form-area>
        <SchemaForm form={form} />
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
 * `variant` picks the title/blurb. `i18n` overrides interface text, validation messages and
 * spec text per locale (keep the object stable, e.g. define it outside the component).
 */
export function DemoApp({ variant, useForm, i18n: overrides }: { variant: 'form' | 'zod'; useForm: UseForm; i18n?: I18nOverrides }) {
  const locales = useMemo(() => supportedLocales(overrides), [overrides]);
  const { settings, resolvedTheme, locale, update } = useSettings(skinIds, locales, messageIds);
  const bundle = useMessageBundle(settings.message);
  const [chosenType, setChosenType] = useState<{ message: string; type: string } | undefined>();
  // a type chosen for another message does not apply here: fall back to the whole message
  const typeName = bundle && chosenType?.message === settings.message && bundle.typeDescriptors[chosenType.type] ? chosenType.type : bundle?.message.rootType;
  const [incoming, setIncoming] = useState<Incoming | undefined>(undefined);
  // the area follows the message (a URL, a paste or a file can change the message); switching back to an area returns to its last message
  const area = messageIndex.find((m) => m.identifier === settings.message)?.area ?? areaIndex[0]!.code;
  const lastInArea = useRef<Record<string, string>>({});
  lastInArea.current[area] = settings.message;
  const i18n = useCreateI18n(locale, overrides);
  const skin = skins.find((s) => s.id === settings.skin) ?? skins[0]!;
  return (
    <I18nProvider value={i18n}>
      <div className="flex h-screen flex-col bg-surface p-4 text-fg">
        <header className="mb-3">
          <div className="-mx-4 -mt-4 mb-3 border-b border-bar-from bg-linear-to-r from-bar-from to-bar-to px-4 py-3 shadow-md">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 className="text-xl font-bold tracking-tight text-bar-fg">{i18n.t(`title_${variant}` as UiKey)}</h1>
              <p className="min-w-0 max-w-2xl text-xs text-bar-muted sm:text-right">{i18n.t(`blurb_${variant}` as UiKey)}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-end justify-start gap-2 sm:flex-nowrap sm:justify-end">
            <AreaPicker value={area} onChange={(code) => update({ message: lastInArea.current[code] ?? messageIndex.find((m) => m.area === code)!.identifier })} />
            <MessagePicker area={area} value={settings.message} onChange={(message) => update({ message })} />
            {bundle && typeName ? <TypePicker bundle={bundle} value={typeName} onChange={(type) => setChosenType({ message: settings.message, type })} /> : null}
            <SettingsPanel settings={settings} skins={skins} locales={locales} onChange={update} />
          </div>
        </header>
        <SkinProvider value={skin}>
          {bundle && typeName ? (
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
                setChosenType({ message: next.identifier, type: next.typeName });
                update({ message: next.identifier });
              }}
              onIncomingApplied={() => setIncoming(undefined)}
            />
          ) : (
            <p className="text-sm text-muted" role="status">
              {i18n.t('loading')}
            </p>
          )}
        </SkinProvider>
      </div>
    </I18nProvider>
  );
}
