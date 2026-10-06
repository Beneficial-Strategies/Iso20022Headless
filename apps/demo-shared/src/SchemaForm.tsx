import type { FieldDescriptor } from '@beneficial-strategies/iso20022-validate';
import type { ReactNode } from 'react';
import type { FormApi } from './formApi.ts';
import { Info, definitionFor } from './Info.tsx';
import { codeDefinitions } from '@beneficial-strategies/iso20022-validate/definitions';

const inputCls =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

/** Current local time as an ISO 20022 date-time with explicit UTC offset, e.g. 2026-10-05T21:30:00-04:00. */
function localIsoNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

function Label({ htmlFor, field, label, info }: { htmlFor?: string; field: { required: boolean }; label: string; info?: ReactNode }) {
  return (
    <div className="mb-0.5 flex items-center gap-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700">
        {label}
        {field.required ? (
          <>
            <span aria-hidden="true" className="text-red-600"> *</span>
            <span className="ml-1 font-normal text-slate-500">(required)</span>
          </>
        ) : null}
      </label>
      {info}
    </div>
  );
}

function ErrorText({ form, path }: { form: FormApi; path: string }) {
  const msg = form.errors[path];
  if (!msg) return null;
  const id = path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '') + '-error';
  return (
    <p id={id} role="alert" className="mt-0.5 text-xs text-red-700">
      {msg}
    </p>
  );
}

interface NodeProps {
  /** Type that owns this field; used to look up its spec definition. */
  parentType?: string;
  /** Suppress the info button (e.g. repeated list items). */
  noInfo?: boolean;
  form: FormApi;
  field: FieldDescriptor;
  path: string;
  label: string;
  /** Overrides field.required (list items are each required). */
  required?: boolean;
  depth: number;
}

function Leaf({ form, field, path, label, required, parentType, noInfo }: NodeProps) {
  const t = form.typeDescriptors[field.type]!;
  const props = form.getFieldProps(path);
  const fieldReq = { required: required ?? field.required };
  let control;
  if (t.kind === 'code' && t.options) {
    const codeDef = props.value ? codeDefinitions[`${t.name}.${props.value}`] : undefined;
    const describedBy = [props['aria-describedby'], codeDef ? `${props.id}-codedef` : ''].filter(Boolean).join(' ');
    control = (
      <>
        <select {...props} aria-describedby={describedBy || undefined} className={inputCls}>
          <option value="">—</option>
          {t.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value} — {o.name}
            </option>
          ))}
        </select>
        {codeDef ? (
          <p id={`${props.id}-codedef`} className="mt-0.5 text-xs text-slate-500">
            {codeDef}
          </p>
        ) : null}
      </>
    );
  } else if (t.kind === 'boolean') {
    control = (
      <select {...props} className={inputCls}>
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (t.kind === 'any') {
    control = <textarea {...props} rows={2} className={inputCls + ' font-mono'} placeholder="<xml/> (raw XML)" />;
  } else {
    const type = t.kind === 'date' ? 'date' : 'text';
    const hint =
      t.kind === 'datetime' ? '2026-10-05T09:30:00Z' : t.kind === 'number' ? 'e.g. 1500.25' : undefined;
    const input = (
      <input {...props} type={type} maxLength={t.maxLength} placeholder={hint} className={inputCls} inputMode={t.kind === 'number' ? 'decimal' : undefined} />
    );
    control =
      t.kind === 'datetime' && props.value === '' ? (
        <div className="flex gap-2">
          <div className="flex-1">{input}</div>
          <button
            type="button"
            className="rounded bg-slate-700 px-2 text-xs text-white hover:bg-slate-600"
            aria-label={`Set ${label} to the current local time`}
            onClick={() => props.onChange(localIsoNow())}
          >
            Now
          </button>
        </div>
      ) : (
        input
      );
  }
  return (
    <div>
      <Label htmlFor={props.id} field={fieldReq} label={label} info={noInfo ? null : <Info text={definitionFor(parentType, field)} label={label} />} />
      {control}
      <ErrorText form={form} path={path} />
    </div>
  );
}

function AmountNode({ form, field, path, label, required, parentType, noInfo }: NodeProps) {
  const ccy = form.getFieldProps(`${path}.Ccy`);
  const val = form.getFieldProps(`${path}.Value`);
  const fieldReq = { required: required ?? field.required };
  return (
    <div>
      <Label field={fieldReq} label={label} info={noInfo ? null : <Info text={definitionFor(parentType, field)} label={label} />} />
      <div className="flex gap-2">
        <div className="w-24">
          <input {...ccy} placeholder="EUR" aria-label={`${label} currency`} className={inputCls} />
          <ErrorText form={form} path={`${path}.Ccy`} />
        </div>
        <div className="flex-1">
          <input {...val} placeholder="0.00" inputMode="decimal" aria-label={`${label} amount`} className={inputCls} />
          <ErrorText form={form} path={`${path}.Value`} />
        </div>
      </div>
      <ErrorText form={form} path={path} />
    </div>
  );
}

function ChoiceNode({ form, field, path, label, required, depth, parentType, noInfo }: NodeProps) {
  const t = form.typeDescriptors[field.type]!;
  const selected = form.getChoice(path);
  const option = t.choiceOptions?.find((o) => o.name === selected);
  const id = path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');
  const fieldReq = { required: required ?? field.required };
  return (
    <div className="rounded border border-dashed border-slate-300 p-2">
      <Label htmlFor={id} field={fieldReq} label={`${label} — choose one`} info={noInfo ? null : <Info text={definitionFor(parentType, field)} label={label} />} />
      <select
        id={id}
        className={inputCls}
        value={selected ?? ''}
        aria-required={fieldReq.required || undefined}
        aria-invalid={form.errors[path] ? true : undefined}
        onChange={(e) => form.selectChoice(path, field.type, e.target.value || undefined)}
      >
        <option value="">— select —</option>
        {t.choiceOptions?.map((o) => (
          <option key={o.name} value={o.name}>
            {o.displayName}
          </option>
        ))}
      </select>
      <ErrorText form={form} path={path} />
      {option ? (
        <div className="mt-2">
          <ValueNode form={form} field={option} path={`${path}.${option.name}`} label={option.displayName} required depth={depth + 1} parentType={field.type} />
        </div>
      ) : null}
    </div>
  );
}

function ComponentNode({ form, field, path, label, required, depth, parentType, noInfo }: NodeProps) {
  const t = form.typeDescriptors[field.type]!;
  return (
    <fieldset className="rounded border border-slate-200 bg-slate-50/60 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        {label}
        {(required ?? field.required) ? <span className="ml-1 text-xs font-normal text-slate-500">(required)</span> : null}
        {noInfo ? null : <span className="ml-1 align-middle"><Info text={definitionFor(parentType, field)} label={label} /></span>}
      </legend>
      <div className="space-y-3">
        {t.fields?.map((f) => <FieldNode key={f.name} form={form} field={f} path={`${path}.${f.name}`} label={f.displayName} depth={depth + 1} parentType={t.name} />)}
      </div>
      <ErrorText form={form} path={path} />
    </fieldset>
  );
}

function ValueNode(p: NodeProps) {
  const kind = p.form.typeDescriptors[p.field.type]!.kind;
  if (kind === 'component') return <ComponentNode {...p} />;
  if (kind === 'choice') return <ChoiceNode {...p} />;
  if (kind === 'amount') return <AmountNode {...p} />;
  return <Leaf {...p} />;
}

function FieldNode({ form, field, path, label, depth, parentType }: Omit<NodeProps, 'required'>) {
  const t = form.typeDescriptors[field.type]!;
  if (field.repeat) {
    const items = (form.getValue(path) as unknown[] | undefined) ?? [];
    const max = field.repeat.max;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">
            {label}
            <span className="ml-1 align-middle"><Info text={definitionFor(parentType, field)} label={label} /></span>
            <span className="ml-1 text-xs font-normal text-slate-500">
              ({field.required ? 'required, ' : ''}{field.repeat.min}..{max ?? '∞'})
            </span>
          </span>
          <button
            type="button"
            className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-40"
            disabled={max !== null && items.length >= max}
            onClick={() => form.addListItem(path, field.type)}
          >
            + Add {label}
          </button>
        </div>
        {items.map((_, i) => (
          <div key={i} className="relative">
            <button
              type="button"
              aria-label={`Remove ${label} ${i + 1}`}
              className="absolute right-1 top-1 z-10 rounded bg-white px-1.5 text-xs text-red-700 ring-1 ring-red-300 hover:bg-red-50"
              onClick={() => form.removeListItem(path, i)}
            >
              Remove
            </button>
            <ValueNode form={form} field={field} path={`${path}[${i}]`} label={`${label} ${i + 1}`} required depth={depth + 1} parentType={parentType} noInfo />
          </div>
        ))}
        <ErrorText form={form} path={path} />
      </div>
    );
  }
  const container = t.kind === 'component' || t.kind === 'choice';
  if (!field.required && container) {
    const present = form.isPresent(path);
    const id = `include-${path.replace(/[^A-Za-z0-9]+/g, '-')}`;
    return (
      <div>
        <div className="flex items-center gap-2">
          <input id={id} type="checkbox" checked={present} onChange={(e) => form.setPresent(path, field.type, e.target.checked)} />
          <label htmlFor={id} className="text-sm text-slate-700">
            Include <span className="font-medium">{label}</span> <span className="text-xs text-slate-500">(optional)</span>
          </label>
          <Info text={definitionFor(parentType, field)} label={label} />
        </div>
        {present ? (
          <div className="mt-2">
            <ValueNode form={form} field={field} path={path} label={label} required depth={depth + 1} parentType={parentType} />
          </div>
        ) : null}
      </div>
    );
  }
  return <ValueNode form={form} field={field} path={path} label={label} depth={depth} parentType={parentType} />;
}

/** Generic recursive renderer for any generated type. Demo-only: the library itself renders nothing. */
export function SchemaForm({ form }: { form: FormApi }) {
  const root = form.typeDescriptors[form.rootType]!;
  const fields = root.kind === 'choice' ? [] : (root.fields ?? []);
  return (
    <div className="space-y-4">
      {root.kind === 'choice' ? (
        <ChoiceNode
          form={form}
          field={{ name: '', xmlTag: '', displayName: root.name, kind: 'choice', type: root.name, required: true }}
          path=""
          label={root.name}
          depth={0}
        />
      ) : (
        fields.map((f) => <FieldNode key={f.name} form={form} field={f} path={f.name} label={f.displayName} depth={0} parentType={root.name} />)
      )}
    </div>
  );
}
