import type { ReactNode } from 'react';
import type { Localized } from '@beneficial-strategies/iso20022-validate/definitions';
import type { FieldProps } from '../formApi.ts';

export interface DescribedOption {
  value: string;
  label: string;
  description?: string | undefined;
}

export interface TextProps {
  field: FieldProps;
  type?: 'text' | 'date';
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  inputMode?: 'decimal' | undefined;
  /** Accessible name when there is no visible <label> for this control. */
  ariaLabel?: string | undefined;
  multiline?: boolean;
  mono?: boolean;
}

export interface SelectProps {
  id: string;
  value: string;
  options: DescribedOption[];
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  invalid?: boolean;
  required?: boolean;
  describedBy?: string | undefined;
}

/**
 * Everything the schema-driven form renders. A skin supplies markup and styling for these
 * primitives; the form logic (what to render, state, validation, ARIA values) lives in the
 * library and in SchemaForm and does not change between skins.
 */
export interface Skin {
  id: string;
  label: string;
  description: string;
  /** Vertical list of sibling fields. */
  Stack: (p: { children: ReactNode }) => ReactNode;
  /** A component: titled group of fields. */
  Group: (p: { title: string; required: boolean; info: ReactNode; error: ReactNode; children: ReactNode }) => ReactNode;
  /** A Choice: selector plus the chosen alternative's fields. */
  ChoiceBox: (p: { children: ReactNode }) => ReactNode;
  /** A single labelled control. */
  Field: (p: { id?: string | undefined; label: string; required: boolean; info: ReactNode; error: ReactNode; children: ReactNode }) => ReactNode;
  /** Controls side by side (currency + amount, input + button). */
  Row: (p: { children: ReactNode; weights?: ('fixed' | 'grow')[] }) => ReactNode;
  Text: (p: TextProps) => ReactNode;
  Select: (p: SelectProps) => ReactNode;
  Button: (p: { children: ReactNode; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; ariaLabel?: string }) => ReactNode;
  /** Small explanatory text under a control. */
  Hint: (p: { id: string; children: ReactNode }) => ReactNode;
  Error: (p: { id: string; children: ReactNode }) => ReactNode;
  /** "Include optional element" switch. */
  Toggle: (p: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: string; info: ReactNode }) => ReactNode;
  /** Header of a repeatable element: title, help, cardinality, add button. */
  ListHeader: (p: { title: string; info: ReactNode; caption: string; action: ReactNode }) => ReactNode;
  ListItem: (p: { removeLabel: string; onRemove: () => void; children: ReactNode }) => ReactNode;
  /** Heading of the whole form (the message or type being edited), with its help. */
  Title: (p: { children: ReactNode; info: ReactNode }) => ReactNode;
  /** Help text for an element (spec definition). */
  Info: (p: { def: Localized | undefined; label: string }) => ReactNode;
}
