import type { FieldDescriptor } from '@beneficial-strategies/iso20022-validate';
import { codeDefinitions } from '@beneficial-strategies/iso20022-validate/definitions';
import type { FormApi } from './formApi.ts';
import { definitionFor } from './Info.tsx';
import { useSkin } from './skin/context.tsx';

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

const idOf = (path: string): string => path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');

function ErrorText({ form, path }: { form: FormApi; path: string }) {
  const S = useSkin();
  const msg = form.errors[path];
  return msg ? <S.Error id={`${idOf(path)}-error`}>{msg}</S.Error> : null;
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

function useInfo({ parentType, field, label, noInfo }: Pick<NodeProps, 'parentType' | 'field' | 'label' | 'noInfo'>) {
  const S = useSkin();
  return noInfo ? null : <S.Info text={definitionFor(parentType, field)} label={label} />;
}

function Leaf(p: NodeProps) {
  const { form, field, path, label, required } = p;
  const S = useSkin();
  const info = useInfo(p);
  const t = form.typeDescriptors[field.type]!;
  const props = form.getFieldProps(path);
  let control;
  if (t.kind === 'code' && t.options) {
    const codeDef = props.value ? codeDefinitions[`${t.name}.${props.value}`] : undefined;
    const describedBy = [props['aria-describedby'], codeDef ? `${props.id}-codedef` : ''].filter(Boolean).join(' ');
    control = (
      <>
        <S.Select
          id={props.id}
          value={props.value}
          options={t.options.map((o) => ({ value: o.value, label: `${o.value} — ${o.name}`, description: codeDefinitions[`${t.name}.${o.value}`] }))}
          onChange={props.onChange}
          onBlur={props.onBlur}
          invalid={props['aria-invalid'] === true}
          required={props['aria-required'] === true}
          describedBy={describedBy || undefined}
        />
        {codeDef ? <S.Hint id={`${props.id}-codedef`}>{codeDef}</S.Hint> : null}
      </>
    );
  } else if (t.kind === 'boolean') {
    control = (
      <S.Select
        id={props.id}
        value={props.value}
        options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
        onChange={props.onChange}
        onBlur={props.onBlur}
        invalid={props['aria-invalid'] === true}
        required={props['aria-required'] === true}
        describedBy={props['aria-describedby']}
      />
    );
  } else if (t.kind === 'any') {
    control = <S.Text field={props} multiline mono placeholder="<xml/> (raw XML)" />;
  } else {
    const hint = t.kind === 'datetime' ? '2026-10-05T09:30:00Z' : t.kind === 'number' ? 'e.g. 1500.25' : undefined;
    const input = (
      <S.Text field={props} type={t.kind === 'date' ? 'date' : 'text'} maxLength={t.maxLength} placeholder={hint} inputMode={t.kind === 'number' ? 'decimal' : undefined} />
    );
    control =
      t.kind === 'datetime' && props.value === '' ? (
        <S.Row weights={['grow', 'fixed']}>
          {input}
          <S.Button variant="secondary" ariaLabel={`Set ${label} to the current local time`} onClick={() => props.onChange(localIsoNow())}>
            Now
          </S.Button>
        </S.Row>
      ) : (
        input
      );
  }
  return (
    <S.Field id={props.id} label={label} required={required ?? field.required} info={info} error={<ErrorText form={form} path={path} />}>
      {control}
    </S.Field>
  );
}

function AmountNode(p: NodeProps) {
  const { form, field, path, label, required } = p;
  const S = useSkin();
  const info = useInfo(p);
  const ccy = form.getFieldProps(`${path}.Ccy`);
  const val = form.getFieldProps(`${path}.Value`);
  return (
    <S.Field
      label={label}
      required={required ?? field.required}
      info={info}
      error={<ErrorText form={form} path={path} />}
    >
      <S.Row weights={['fixed', 'grow']}>
        <div>
          <S.Text field={ccy} placeholder="EUR" ariaLabel={`${label} currency`} />
          <ErrorText form={form} path={`${path}.Ccy`} />
        </div>
        <div>
          <S.Text field={val} placeholder="0.00" inputMode="decimal" ariaLabel={`${label} amount`} />
          <ErrorText form={form} path={`${path}.Value`} />
        </div>
      </S.Row>
    </S.Field>
  );
}

function ChoiceNode(p: NodeProps) {
  const { form, field, path, label, required, depth } = p;
  const S = useSkin();
  const info = useInfo(p);
  const t = form.typeDescriptors[field.type]!;
  const selected = form.getChoice(path);
  const option = t.choiceOptions?.find((o) => o.name === selected);
  const id = idOf(path);
  const isRequired = required ?? field.required;
  return (
    <S.ChoiceBox>
      <S.Field id={id} label={`${label} — choose one`} required={isRequired} info={info} error={<ErrorText form={form} path={path} />}>
        <S.Select
          id={id}
          value={selected ?? ''}
          options={(t.choiceOptions ?? []).map((o) => ({ value: o.name, label: o.displayName, description: definitionFor(field.type, o) }))}
          onChange={(v) => form.selectChoice(path, field.type, v || undefined)}
          invalid={Boolean(form.errors[path])}
          required={isRequired}
          describedBy={form.errors[path] ? `${id}-error` : undefined}
        />
      </S.Field>
      {option ? (
        <ValueNode form={form} field={option} path={`${path}.${option.name}`} label={option.displayName} required depth={depth + 1} parentType={field.type} />
      ) : null}
    </S.ChoiceBox>
  );
}

function ComponentNode(p: NodeProps) {
  const { form, field, path, label, required, depth } = p;
  const S = useSkin();
  const info = useInfo(p);
  const t = form.typeDescriptors[field.type]!;
  return (
    <S.Group title={label} required={required ?? field.required} info={info} error={<ErrorText form={form} path={path} />}>
      {t.fields?.map((f) => (
        <FieldNode key={f.name} form={form} field={f} path={`${path}.${f.name}`} label={f.displayName} depth={depth + 1} parentType={t.name} />
      ))}
    </S.Group>
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
  const S = useSkin();
  const t = form.typeDescriptors[field.type]!;
  if (field.repeat) {
    const items = (form.getValue(path) as unknown[] | undefined) ?? [];
    const max = field.repeat.max;
    return (
      <div>
        <S.ListHeader
          title={label}
          info={<S.Info text={definitionFor(parentType, field)} label={label} />}
          caption={`${field.required ? 'required, ' : ''}${field.repeat.min}..${max ?? '∞'}`}
          action={
            <S.Button disabled={max !== null && items.length >= max} onClick={() => form.addListItem(path, field.type)}>
              + Add {label}
            </S.Button>
          }
        />
        <S.Stack>
          {items.map((_, i) => (
            <S.ListItem key={i} removeLabel={`Remove ${label} ${i + 1}`} onRemove={() => form.removeListItem(path, i)}>
              <ValueNode form={form} field={field} path={`${path}[${i}]`} label={`${label} ${i + 1}`} required depth={depth + 1} parentType={parentType} noInfo />
            </S.ListItem>
          ))}
        </S.Stack>
        <ErrorText form={form} path={path} />
      </div>
    );
  }
  const container = t.kind === 'component' || t.kind === 'choice';
  if (!field.required && container) {
    const present = form.isPresent(path);
    return (
      <div>
        <S.Toggle
          id={`include-${idOf(path)}`}
          checked={present}
          onChange={(c) => form.setPresent(path, field.type, c)}
          label={label}
          info={<S.Info text={definitionFor(parentType, field)} label={label} />}
        />
        {present ? <ValueNode form={form} field={field} path={path} label={label} required depth={depth + 1} parentType={parentType} /> : null}
      </div>
    );
  }
  return <ValueNode form={form} field={field} path={path} label={label} depth={depth} parentType={parentType} />;
}

/** Generic recursive renderer for any generated type. Demo-only: the library itself renders nothing. */
export function SchemaForm({ form }: { form: FormApi }) {
  const S = useSkin();
  const root = form.typeDescriptors[form.rootType]!;
  const fields = root.kind === 'choice' ? [] : (root.fields ?? []);
  return (
    <S.Stack>
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
    </S.Stack>
  );
}
