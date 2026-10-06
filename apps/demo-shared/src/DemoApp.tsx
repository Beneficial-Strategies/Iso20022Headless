import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import type { z } from 'zod';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate';
import { serializeFragment, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import type { UseForm } from './formApi.ts';
import { SchemaForm } from './SchemaForm.tsx';
import { XmlPane } from './XmlPane.tsx';

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
        className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-slate-500">Type: </span>
        <span className="font-mono">{value}</span>
      </button>
      {open ? (
        <Command className="absolute z-20 mt-1 w-full rounded border border-slate-300 bg-white shadow-lg" label="Find an ISO 20022 type">
          <Command.Input autoFocus placeholder="Search types… (e.g. PostalAddress, Party, Choice)" className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none" />
          <Command.List className="max-h-72 overflow-auto p-1">
            <Command.Empty className="px-3 py-2 text-sm text-slate-500">No match</Command.Empty>
            {names.map((n) => (
              <Command.Item
                key={n}
                value={n}
                className="cursor-pointer rounded px-3 py-1 font-mono text-xs aria-selected:bg-indigo-100"
                onSelect={() => {
                  onChange(n);
                  setOpen(false);
                }}
              >
                {n}
                {n === MESSAGE_TYPE ? <span className="ml-2 font-sans text-slate-500">(whole message, {pain001Message.identifier})</span> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      ) : null}
    </div>
  );
}

function Editor({ useForm, typeName }: { useForm: UseForm; typeName: string }) {
  const form = useForm({ schema: (schemas as unknown as Record<string, z.ZodType>)[typeName]!, typeDescriptors: pain001Message.typeDescriptors, rootType: typeName });
  const [submitted, setSubmitted] = useState(false);
  const xml = useMemo(
    () =>
      typeName === MESSAGE_TYPE
        ? serializeToXml(pain001Message, form.values)
        : serializeFragment(pain001Message.typeDescriptors, typeName, form.values),
    [form.values, typeName],
  );
  const errorCount = Object.keys(form.allErrors).length;
  const rules = pain001Message.typeDescriptors[typeName]?.rules;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="min-h-0 overflow-auto pr-2" aria-label="Form">
        <SchemaForm form={form} />
        {rules?.length ? (
          <details className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-amber-900">Business rules not enforced by the schema ({rules.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
              {rules.map((r) => (
                <li key={r.name}>
                  <span className="font-mono">{r.name}</span>: {r.text}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
            onClick={() => {
              form.touchAll();
              setSubmitted(true);
            }}
          >
            Done editing
          </button>
          {submitted ? <span className="text-sm text-slate-600">{form.isValid ? 'Looks complete.' : `${errorCount} problem(s) remain.`}</span> : null}
        </div>
      </section>
      <section className="flex min-h-0 flex-col" aria-label="XML preview">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <span className="font-semibold">XML</span>
          <span
            className={`rounded px-2 py-0.5 text-xs ${form.isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
            role="status"
          >
            {form.isValid ? 'valid' : `draft — ${errorCount} problem(s)`}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <XmlPane xml={xml} />
        </div>
      </section>
    </div>
  );
}

export function DemoApp({ title, blurb, useForm }: { title: string; blurb: string; useForm: UseForm }) {
  const [typeName, setTypeName] = useState<string>(MESSAGE_TYPE);
  return (
    <div className="flex h-screen flex-col bg-white p-4 text-slate-900">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="max-w-3xl text-xs text-slate-600">{blurb}</p>
        </div>
        <TypePicker value={typeName} onChange={setTypeName} />
      </header>
      <Editor key={typeName} useForm={useForm} typeName={typeName} />
    </div>
  );
}
