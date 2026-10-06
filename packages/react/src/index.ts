import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import type { z } from 'zod';
import {
  descriptorAt,
  emptyValue,
  formatIssues,
  getIn,
  initialValue,
  pruneEmpty,
  type TypeDescriptors,
  type ValidationMessages,
} from '@beneficial-strategies/iso20022-validate';

export interface MessageDefinition {
  schema: z.ZodType;
  typeDescriptors: TypeDescriptors;
  rootType: string;
  /** Wording for validation errors (see `createMessages`); English when omitted. */
  messages?: ValidationMessages;
}

export interface FieldProps {
  id: string;
  name: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> | string) => void;
  onBlur: () => void;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'aria-required'?: true;
}

export interface Iso20022Form {
  typeDescriptors: TypeDescriptors;
  rootType: string;
  values: unknown;
  /** Errors to display: only for touched fields (and their ancestors), or all after touchAll(). */
  errors: Record<string, string>;
  /** Every current validation error regardless of touched state. */
  allErrors: Record<string, string>;
  isValid: boolean;
  getFieldProps: (path: string) => FieldProps;
  getValue: (path: string) => unknown;
  /** Exactly-one-of: which variant is selected at a Choice path (undefined if none). */
  getChoice: (path: string) => string | undefined;
  selectChoice: (path: string, choiceType: string, variant: string | undefined) => void;
  /** Optional (non-repeating) component/choice present or not. */
  isPresent: (path: string) => boolean;
  setPresent: (path: string, type: string, present: boolean) => void;
  addListItem: (path: string, type: string) => void;
  removeListItem: (path: string, index: number) => void;
  touchAll: () => void;
}

const idOf = (path: string): string => path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');

/**
 * Headless ISO 20022 form: TanStack Form owns values/touched state; the generated Zod schema
 * and descriptors own validation and structure. Returns props to spread; renders nothing.
 */
export function useIso20022Form(message: MessageDefinition): Iso20022Form {
  const { schema, typeDescriptors, rootType, messages } = message;
  const form = useForm({ defaultValues: initialValue(typeDescriptors, rootType) as Record<string, unknown> });
  const values = useStore(form.store, (s) => s.values);
  const fieldMeta = useStore(form.store, (s) => s.fieldMeta) as Record<string, { isTouched?: boolean } | undefined>;
  const [allTouched, setAllTouched] = useState(false);

  const allErrors = useMemo(() => {
    const r = schema.safeParse(pruneEmpty(values) ?? {});
    return r.success ? {} : formatIssues(r.error, messages);
  }, [schema, values, messages]);

  const touchedPaths = Object.keys(fieldMeta).filter((p) => fieldMeta[p]?.isTouched);
  const errors = useMemo(() => {
    if (allTouched) return allErrors;
    const out: Record<string, string> = {};
    for (const [path, msg] of Object.entries(allErrors)) {
      if (touchedPaths.some((t) => t === path || t.startsWith(path + '.') || t.startsWith(path + '['))) out[path] = msg;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allErrors, allTouched, touchedPaths.join('|')]);

  const getValue = useCallback((path: string) => getIn(values, path), [values]);

  const getFieldProps = useCallback(
    (path: string): FieldProps => {
      const id = idOf(path);
      const field = descriptorAt(typeDescriptors, rootType, path);
      const current = getIn(values, path);
      const props: FieldProps = {
        id,
        name: path,
        value: typeof current === 'string' ? current : '',
        onChange: (e) => {
          const next = typeof e === 'string' ? e : e.target.value;
          form.setFieldValue(path as never, next as never);
        },
        onBlur: () => {
          form.setFieldMeta(path as never, (m: Record<string, unknown>) => ({ ...m, isTouched: true }) as never);
        },
      };
      if (errors[path]) {
        props['aria-invalid'] = true;
        props['aria-describedby'] = `${id}-error`;
      }
      if (field?.required) props['aria-required'] = true;
      return props;
    },
    [errors, form, rootType, typeDescriptors, values],
  );

  const getChoice = useCallback(
    (path: string) => {
      const v = getIn(values, path);
      return v && typeof v === 'object' ? Object.keys(v)[0] : undefined;
    },
    [values],
  );

  const selectChoice: Iso20022Form['selectChoice'] = (path, choiceType, variant) => {
    if (variant === undefined) {
      form.setFieldValue(path as never, {} as never);
      return;
    }
    const opt = typeDescriptors[choiceType]?.choiceOptions?.find((o) => o.name === variant);
    form.setFieldValue(path as never, { [variant]: opt ? emptyValue(typeDescriptors, opt.type) : '' } as never);
  };

  const isPresent = useCallback((path: string) => getIn(values, path) !== undefined, [values]);
  const setPresent: Iso20022Form['setPresent'] = (path, type, present) => {
    form.setFieldValue(path as never, (present ? emptyValue(typeDescriptors, type) : undefined) as never);
  };
  const addListItem: Iso20022Form['addListItem'] = (path, type) => {
    if (getIn(values, path) === undefined) form.setFieldValue(path as never, [] as never);
    form.pushFieldValue(path as never, emptyValue(typeDescriptors, type) as never);
  };
  const removeListItem: Iso20022Form['removeListItem'] = (path, index) => {
    form.removeFieldValue(path as never, index);
  };

  return {
    typeDescriptors,
    rootType,
    values,
    errors,
    allErrors,
    isValid: Object.keys(allErrors).length === 0,
    getFieldProps,
    getValue,
    getChoice,
    selectChoice,
    isPresent,
    setPresent,
    addListItem,
    removeListItem,
    touchAll: () => setAllTouched(true),
  };
}
