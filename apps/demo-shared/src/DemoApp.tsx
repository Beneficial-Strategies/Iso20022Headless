import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import type { z } from 'zod';
import { evaluateRules, pain001Message, ruleCodeLists, schemas, type RuleResult } from '@beneficial-strategies/iso20022-validate';
import { serializeFragment, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import type { UseForm } from './formApi.ts';
import { SchemaForm } from './SchemaForm.tsx';
import { XmlPane } from './XmlPane.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { useSettings } from './settings.ts';
import { SkinProvider, skinIds, skins } from './skin/index.ts';

const MESSAGE_TYPE = pain001Message.rootType;

function TypePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
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
        <span className="text-muted">Type: </span>
        <span className="font-mono">{value}</span>
      </button>
      {open ? (
        <Command className="absolute z-20 mt-1 w-full rounded border border-edge bg-surface text-fg shadow-lg" label="Find an ISO 20022 type">
          <Command.Input autoFocus placeholder="Search types… (e.g. PostalAddress, Party, Choice)" className="w-full border-b border-line bg-surface px-3 py-2 text-sm text-fg outline-none" />
          <Command.List className="max-h-72 overflow-auto p-1">
            <Command.Empty className="px-3 py-2 text-sm text-muted">No match</Command.Empty>
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
                {n === MESSAGE_TYPE ? <span className="ml-2 font-sans text-muted">(whole message, {pain001Message.identifier})</span> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      ) : null}
    </div>
  );
}

const STATUS: Record<RuleResult['status'], { icon: string; label: string; cls: string }> = {
  pass: { icon: '✓', label: 'passes', cls: 'text-ok-fg' },
  fail: { icon: '✗', label: 'violated', cls: 'text-danger' },
  unsupported: { icon: '!', label: 'cannot be checked automatically', cls: 'text-warn-fg' },
  'prose-only': { icon: '○', label: 'guideline (not machine-checkable)', cls: 'text-muted' },
};

function RulesPanel({ results }: { results: RuleResult[] }) {
  if (results.length === 0) return null;
  const failed = results.filter((r) => r.status === 'fail');
  const counts = (['pass', 'fail', 'unsupported', 'prose-only'] as const).map((k) => `${results.filter((r) => r.status === k).length} ${STATUS[k].label}`);
  return (
    <details className="mt-4 rounded border border-warn-line bg-warn-soft p-3 text-xs" open={failed.length > 0}>
      <summary className="cursor-pointer font-semibold text-warn-fg">
        Business rules ({failed.length > 0 ? `${failed.length} violated` : 'none violated'}) <span className="font-normal">— {counts.join(', ')}</span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {results.map((r) => {
          const st = STATUS[r.status];
          return (
            <li key={`${r.instancePath}:${r.rule}`} className="text-fg">
              <span className={`mr-1 font-bold ${st.cls}`} aria-hidden="true">{st.icon}</span>
              <span className="sr-only">{st.label}: </span>
              <span className="font-mono">{r.rule}</span>
              {r.instancePath ? <span className="text-muted"> @ {r.instancePath}</span> : null}: {r.text}
              {r.reason ? <span className="text-warn-fg"> ({r.reason})</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Editor({ useForm, typeName, dark }: { useForm: UseForm; typeName: string; dark: boolean }) {
  const form = useForm({ schema: (schemas as unknown as Record<string, z.ZodType>)[typeName]!, typeDescriptors: pain001Message.typeDescriptors, rootType: typeName });
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
            Done editing
          </button>
          {submitted ? <span className="text-sm text-muted">{valid ? 'Looks complete.' : `${errorCount} problem(s) remain.`}</span> : null}
        </div>
      </section>
      <section className="flex min-h-0 flex-col" aria-label="XML preview">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <span className="font-semibold">XML</span>
          <span
            className={`rounded px-2 py-0.5 text-xs ${valid ? 'bg-ok-soft text-ok-fg' : 'bg-warn-soft text-warn-fg'}`}
            role="status"
          >
            {valid ? 'valid' : `draft — ${errorCount} problem(s)`}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <XmlPane xml={xml} dark={dark} />
        </div>
      </section>
    </div>
  );
}

export function DemoApp({ title, blurb, useForm }: { title: string; blurb: string; useForm: UseForm }) {
  const [typeName, setTypeName] = useState<string>(MESSAGE_TYPE);
  const { settings, resolvedTheme, update } = useSettings(skinIds);
  const skin = skins.find((s) => s.id === settings.skin) ?? skins[0]!;
  return (
    <div className="flex h-screen flex-col bg-surface p-4 text-fg">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="max-w-3xl text-xs text-muted">{blurb}</p>
        </div>
        <div className="flex items-end gap-2">
          <TypePicker value={typeName} onChange={setTypeName} />
          <SettingsPanel settings={settings} skins={skins} onChange={update} />
        </div>
      </header>
      <SkinProvider value={skin}>
        <Editor key={typeName} useForm={useForm} typeName={typeName} dark={resolvedTheme === 'dark'} />
      </SkinProvider>
    </div>
  );
}
