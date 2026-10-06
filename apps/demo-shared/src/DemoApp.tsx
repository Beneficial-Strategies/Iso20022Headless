import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import type { z } from 'zod';
import { evaluateRules, formatIssue, pain001Message, ruleCodeLists, schemas, type RuleResult } from '@beneficial-strategies/iso20022-validate';
import { serializeFragment, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import type { UseForm } from './formApi.ts';
import type { UiKey } from './i18n/messages.ts';
import { SchemaForm } from './SchemaForm.tsx';
import { XmlPane } from './XmlPane.tsx';
import { I18nProvider, supportedLocales, useCreateI18n, useI18n, type I18nOverrides } from './i18n/context.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { useSettings } from './settings.ts';
import { SkinProvider, skinIds, skins } from './skin/index.ts';

const MESSAGE_TYPE = pain001Message.rootType;

function TypePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const names = useMemo(() => [MESSAGE_TYPE, ...Object.keys(schemas).filter((n) => n !== MESSAGE_TYPE && pain001Message.typeDescriptors[n]?.kind === 'component').sort()], []);
  return (
    <div className="relative w-96">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full rounded border border-edge bg-surface px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted">{t('typeLabel')}</span>
        <span className="font-mono">{value}</span>
      </button>
      {open ? (
        <Command className="absolute z-20 mt-1 w-full rounded border border-edge bg-surface text-fg shadow-lg" label={t('findType')}>
          <Command.Input autoFocus placeholder={t('typeSearch')} className="w-full border-b border-line bg-surface px-3 py-2 text-sm text-fg outline-none" />
          <Command.List className="max-h-72 overflow-auto p-1">
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
                {n === MESSAGE_TYPE ? <span className="ml-2 font-sans text-muted">{t('wholeMessage', { id: pain001Message.identifier })}</span> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
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

function Editor({ useForm, typeName, dark }: { useForm: UseForm; typeName: string; dark: boolean }) {
  const { t, validation } = useI18n();
  const form = useForm({ schema: (schemas as unknown as Record<string, z.ZodType>)[typeName]!, typeDescriptors: pain001Message.typeDescriptors, rootType: typeName, messages: validation });
  const [submitted, setSubmitted] = useState(false);
  const xml = useMemo(
    () =>
      typeName === MESSAGE_TYPE
        ? serializeToXml(pain001Message, form.values)
        : serializeFragment(pain001Message.typeDescriptors, typeName, form.values),
    [form.values, typeName],
  );
  const ruleResults = useMemo(
    () => evaluateRules({ types: pain001Message.typeDescriptors, codeLists: ruleCodeLists }, typeName, form.values),
    [form.values, typeName],
  );
  const failedRules = ruleResults.filter((r) => r.status === 'fail');
  const errorCount = Object.keys(form.allErrors).length + failedRules.length;
  const valid = form.isValid && failedRules.length === 0;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="min-h-0 overflow-auto pr-2" aria-label="Form">
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
          {submitted ? <span className="text-sm text-muted">{valid ? t('looksComplete') : t('problemsRemain', { n: errorCount })}</span> : null}
        </div>
      </section>
      <section className="flex min-h-0 flex-col" aria-label="XML preview">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <span className="font-semibold">{t('xml')}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs ${valid ? 'bg-ok-soft text-ok-fg' : 'bg-warn-soft text-warn-fg'}`}
            role="status"
          >
            {valid ? t('valid') : t('draft', { n: errorCount })}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <XmlPane xml={xml} dark={dark} />
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
  const [typeName, setTypeName] = useState<string>(MESSAGE_TYPE);
  const locales = useMemo(() => supportedLocales(overrides), [overrides]);
  const { settings, resolvedTheme, locale, update } = useSettings(skinIds, locales);
  const i18n = useCreateI18n(locale, overrides);
  const skin = skins.find((s) => s.id === settings.skin) ?? skins[0]!;
  return (
    <I18nProvider value={i18n}>
      <div className="flex h-screen flex-col bg-surface p-4 text-fg">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{i18n.t(`title_${variant}` as UiKey)}</h1>
            <p className="max-w-3xl text-xs text-muted">{i18n.t(`blurb_${variant}` as UiKey)}</p>
          </div>
          <div className="flex items-end gap-2">
            <TypePicker value={typeName} onChange={setTypeName} />
            <SettingsPanel settings={settings} skins={skins} locales={locales} onChange={update} />
          </div>
        </header>
        <SkinProvider value={skin}>
          <Editor key={typeName} useForm={useForm} typeName={typeName} dark={resolvedTheme === 'dark'} />
        </SkinProvider>
      </div>
    </I18nProvider>
  );
}
