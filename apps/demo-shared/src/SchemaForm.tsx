import type { FieldDescriptor } from '@beneficial-strategies/iso20022-validate';
import type { FormApi } from './formApi.ts';
import { useI18n } from './i18n/context.tsx';
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

/** Translated element label (English name derived from the ISO element name when there is no translation). */
function useLabel() {
  const { defs } = useI18n();
  return (f: FieldDescriptor): string => defs.label(f, f.displayName).text;
}

interface NodeProps {
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

function useInfo({ form, field, label, noInfo }: Pick<NodeProps, 'form' | 'field' | 'label' | 'noInfo'>) {
  const S = useSkin();
  const { defs } = useI18n();
  return noInfo ? null : <S.Info def={defs.field(field, form.typeDescriptors[field.type])} label={label} />;
}

function Leaf(p: NodeProps) {
  const { form, field, path, label, required } = p;
  const S = useSkin();
  const { t, defs } = useI18n();
  const info = useInfo(p);
  const type = form.typeDescriptors[field.type]!;
  const props = form.getFieldProps(path);
  let control;
  if (type.kind === 'code' && type.options) {
    const selected = type.options.find((o) => o.value === props.value);
    const codeDef = selected ? defs.code(selected)?.text : undefined;
    const describedBy = [props['aria-describedby'], codeDef ? `${props.id}-codedef` : ''].filter(Boolean).join(' ');
    control = (
      <>
        <S.Select
          id={props.id}
          value={props.value}
          options={type.options.map((o) => ({ value: o.value, label: `${o.value} — ${defs.codeName(o, o.name).text}`, description: defs.code(o)?.text }))}
          onChange={props.onChange}
          onBlur={props.onBlur}
          invalid={props['aria-invalid'] === true}
          required={props['aria-required'] === true}
          describedBy={describedBy || undefined}
        />
        {codeDef ? <S.Hint id={`${props.id}-codedef`}>{codeDef}</S.Hint> : null}
      </>
    );
  } else if (type.kind === 'boolean') {
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
  } else if (type.kind === 'any') {
    control = <S.Text field={props} multiline mono placeholder={t('rawXml')} />;
  } else {
    const hint = type.kind === 'datetime' ? '2026-10-05T09:30:00Z' : type.kind === 'number' ? 'e.g. 1500.25' : undefined;
    const input = (
      <S.Text field={props} type={type.kind === 'date' ? 'date' : 'text'} maxLength={type.maxLength} placeholder={hint} inputMode={type.kind === 'number' ? 'decimal' : undefined} />
    );
    control =
      type.kind === 'datetime' && props.value === '' ? (
        <S.Row weights={['grow', 'fixed']}>
          {input}
          <S.Button variant="secondary" ariaLabel={t('nowAria', { label })} onClick={() => props.onChange(localIsoNow())}>
            {t('now')}
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
  const { t } = useI18n();
  const info = useInfo(p);
  const ccy = form.getFieldProps(`${path}.Ccy`);
  const val = form.getFieldProps(`${path}.Value`);
  return (
    <S.Field label={label} required={required ?? field.required} info={info} error={<ErrorText form={form} path={path} />}>
      <S.Row weights={['fixed', 'grow']}>
        <div>
          <S.Text field={ccy} placeholder="EUR" ariaLabel={t('currencyOf', { label })} />
          <ErrorText form={form} path={`${path}.Ccy`} />
        </div>
        <div>
          <S.Text field={val} placeholder="0.00" inputMode="decimal" ariaLabel={t('amountOf', { label })} />
          <ErrorText form={form} path={`${path}.Value`} />
        </div>
      </S.Row>
    </S.Field>
  );
}

function ChoiceNode(p: NodeProps) {
  const { form, field, path, label, required, depth } = p;
  const S = useSkin();
  const { t, defs } = useI18n();
  const labelOf = useLabel();
  const info = useInfo(p);
  const type = form.typeDescriptors[field.type]!;
  const selected = form.getChoice(path);
  const option = type.choiceOptions?.find((o) => o.name === selected);
  const id = idOf(path);
  const isRequired = required ?? field.required;
  return (
    <S.ChoiceBox>
      <S.Field id={id} label={t('chooseOne', { label })} required={isRequired} info={info} error={<ErrorText form={form} path={path} />}>
        <S.Select
          id={id}
          value={selected ?? ''}
          options={(type.choiceOptions ?? []).map((o) => ({
            value: o.name,
            label: labelOf(o),
            description: defs.field(o, form.typeDescriptors[o.type])?.text,
          }))}
          onChange={(v) => form.selectChoice(path, field.type, v || undefined)}
          invalid={Boolean(form.errors[path])}
          required={isRequired}
          describedBy={form.errors[path] ? `${id}-error` : undefined}
        />
      </S.Field>
      {option ? <ValueNode form={form} field={option} path={`${path}.${option.name}`} label={labelOf(option)} required depth={depth + 1} /> : null}
    </S.ChoiceBox>
  );
}

function ComponentNode(p: NodeProps) {
  const { form, field, path, label, required, depth } = p;
  const S = useSkin();
  const labelOf = useLabel();
  const info = useInfo(p);
  const type = form.typeDescriptors[field.type]!;
  return (
    <S.Group title={label} required={required ?? field.required} info={info} error={<ErrorText form={form} path={path} />}>
      {type.fields?.map((f) => (
        <FieldNode key={f.name} form={form} field={f} path={`${path}.${f.name}`} label={labelOf(f)} depth={depth + 1} />
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

function FieldNode({ form, field, path, label, depth }: Omit<NodeProps, 'required'>) {
  const S = useSkin();
  const { t, defs } = useI18n();
  const type = form.typeDescriptors[field.type]!;
  const info = <S.Info def={defs.field(field, type)} label={label} />;
  if (field.repeat) {
    const items = (form.getValue(path) as unknown[] | undefined) ?? [];
    const max = field.repeat.max;
    return (
      <div>
        <S.ListHeader
          title={label}
          info={info}
          caption={`${field.required ? t('listRequired') : ''}${field.repeat.min}..${max ?? '∞'}`}
          action={
            <S.Button disabled={max !== null && items.length >= max} onClick={() => form.addListItem(path, field.type)}>
              {t('add', { label })}
            </S.Button>
          }
        />
        <S.Stack>
          {items.map((_, i) => (
            <S.ListItem key={i} removeLabel={t('removeItem', { label, n: i + 1 })} onRemove={() => form.removeListItem(path, i)}>
              <ValueNode form={form} field={field} path={`${path}[${i}]`} label={`${label} ${i + 1}`} required depth={depth + 1} noInfo />
            </S.ListItem>
          ))}
        </S.Stack>
        <ErrorText form={form} path={path} />
      </div>
    );
  }
  const container = type.kind === 'component' || type.kind === 'choice';
  if (!field.required && container) {
    const present = form.isPresent(path);
    return (
      <div>
        <S.Toggle id={`include-${idOf(path)}`} checked={present} onChange={(c) => form.setPresent(path, field.type, c)} label={label} info={info} />
        {present ? <ValueNode form={form} field={field} path={path} label={label} required depth={depth + 1} /> : null}
      </div>
    );
  }
  return <ValueNode form={form} field={field} path={path} label={label} depth={depth} />;
}

/** Generic recursive renderer for any generated type. Demo-only: the library itself renders nothing. */
export function SchemaForm({ form }: { form: FormApi }) {
  const S = useSkin();
  const labelOf = useLabel();
  const root = form.typeDescriptors[form.rootType]!;
  const fields = root.kind === 'choice' ? [] : (root.fields ?? []);
  return (
    // data-schema-form marks everything the skin renders, so page chrome around it can be told apart
    <div data-schema-form>
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
        fields.map((f) => <FieldNode key={f.name} form={form} field={f} path={f.name} label={labelOf(f)} depth={0} />)
      )}
    </S.Stack>
    </div>
  );
}
