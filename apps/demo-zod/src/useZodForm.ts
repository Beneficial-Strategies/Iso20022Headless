import { useCallback, useMemo, useState } from 'react';
import {
  descriptorAt,
  emptyValue,
  formatIssues,
  getIn,
  initialValue,
  pruneForValidation,
  removeIn,
  setIn,
} from '@beneficial-strategies/iso20022-validate';
import type { FieldProps, FormApi, FormTarget } from '@beneficial-strategies/iso20022-react-ui';

/**
 * The same FormApi as the library's hook, built by hand on plain React state + the generated Zod
 * schema. Everything a consumer without TanStack Form has to write for themselves.
 */
export function useZodForm({ schema, typeDescriptors, rootType, messages }: FormTarget): FormApi {
  const [values, setValues] = useState<unknown>(() => initialValue(typeDescriptors, rootType));
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [allTouched, setAllTouched] = useState(false);

  const allErrors = useMemo(() => {
    const r = schema.safeParse(pruneForValidation(typeDescriptors, rootType, values));
    return r.success ? {} : formatIssues(r.error, messages);
  }, [schema, values, messages]);

  const errors = useMemo(() => {
    if (allTouched) return allErrors;
    const out: Record<string, string> = {};
    for (const [path, msg] of Object.entries(allErrors)) {
      for (const t of touched) {
        if (t === path || t.startsWith(path + '.') || t.startsWith(path + '[')) {
          out[path] = msg;
          break;
        }
      }
    }
    return out;
  }, [allErrors, allTouched, touched]);

  const set = useCallback((path: string, v: unknown) => setValues((cur: unknown) => setIn(cur, path, v)), []);

  const getFieldProps = (path: string): FieldProps => {
    const id = path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');
    const current = getIn(values, path);
    const props: FieldProps = {
      id,
      name: path,
      value: typeof current === 'string' ? current : '',
      onChange: (e) => set(path, typeof e === 'string' ? e : e.target.value),
      onBlur: () => setTouched((t) => new Set(t).add(path)),
    };
    if (errors[path]) {
      props['aria-invalid'] = true;
      props['aria-describedby'] = `${id}-error`;
    }
    if (descriptorAt(typeDescriptors, rootType, path)?.required) props['aria-required'] = true;
    return props;
  };

  return {
    typeDescriptors,
    rootType,
    values,
    errors,
    allErrors,
    isValid: Object.keys(allErrors).length === 0,
    getFieldProps,
    getValue: (path) => getIn(values, path),
    getChoice: (path) => {
      const v = getIn(values, path);
      return v && typeof v === 'object' ? Object.keys(v)[0] : undefined;
    },
    selectChoice: (path, choiceType, variant) => {
      if (variant === undefined) return set(path, {});
      const opt = typeDescriptors[choiceType]?.choiceOptions?.find((o) => o.name === variant);
      set(path, { [variant]: opt ? emptyValue(typeDescriptors, opt.type) : '' });
    },
    isPresent: (path) => getIn(values, path) !== undefined,
    setPresent: (path, type, present) =>
      present ? set(path, emptyValue(typeDescriptors, type)) : setValues((cur: unknown) => removeIn(cur, path)),
    addListItem: (path, type) =>
      set(path, [...((getIn(values, path) as unknown[] | undefined) ?? []), emptyValue(typeDescriptors, type)]),
    removeListItem: (path, index) => setValues((cur: unknown) => removeIn(cur, `${path}[${index}]`)),
    touchAll: () => setAllTouched(true),
  };
}
