import type { ChangeEvent } from 'react';
import type { TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import type { z } from 'zod';

/**
 * The contract the demo UI renders against. `useIso20022Form` (TanStack-based library hook) and
 * the hand-rolled `useZodForm` in demo-zod both satisfy it, so the same UI drives either.
 */
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

export interface FormApi {
  typeDescriptors: TypeDescriptors;
  rootType: string;
  values: unknown;
  errors: Record<string, string>;
  allErrors: Record<string, string>;
  isValid: boolean;
  getFieldProps: (path: string) => FieldProps;
  getValue: (path: string) => unknown;
  getChoice: (path: string) => string | undefined;
  selectChoice: (path: string, choiceType: string, variant: string | undefined) => void;
  isPresent: (path: string) => boolean;
  setPresent: (path: string, type: string, present: boolean) => void;
  addListItem: (path: string, type: string) => void;
  removeListItem: (path: string, index: number) => void;
  touchAll: () => void;
}

export interface FormTarget {
  schema: z.ZodType;
  typeDescriptors: TypeDescriptors;
  rootType: string;
}

export type UseForm = (target: FormTarget) => FormApi;
