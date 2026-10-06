/**
 * Validation and rule-diagnostic messages.
 *
 * The library reports problems as an `Issue` (a code plus parameters) and ships a default
 * catalog per language. Consumers override any message, or whole languages, without touching
 * the library:
 *
 *   createMessages('es', { required: 'Campo obligatorio' })   // Spanish with one change
 *   { ...en, too_long: ({ max }) => `Max ${max}` }            // plain object spread works too
 *
 * A message is a template with `{param}` placeholders, or a function (for plurals and the like).
 */

import { formatHint } from './patterns.ts';

export type IssueCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'decimal_format'
  | 'date_format'
  | 'datetime_format'
  | 'time_format'
  | 'year_format'
  | 'too_short'
  | 'too_long'
  | 'too_few_items'
  | 'too_many_items'
  | 'not_allowed_value'
  | 'select_one'
  | 'not_allowed_here'
  | 'fraction_digits'
  | 'total_digits'
  | 'min_inclusive'
  | 'invalid'
  | 'rule_literal_not_code_value'
  | 'rule_path_unknown'
  | 'rule_code_list_unavailable'
  | 'rule_operator_unsupported';

export const ISSUE_CODES: readonly IssueCode[] = [
  'required', 'invalid_type', 'invalid_format', 'decimal_format', 'date_format', 'datetime_format', 'time_format', 'year_format',
  'too_short', 'too_long', 'too_few_items', 'too_many_items', 'not_allowed_value', 'select_one', 'not_allowed_here',
  'fraction_digits', 'total_digits', 'min_inclusive', 'invalid',
  'rule_literal_not_code_value', 'rule_path_unknown', 'rule_code_list_unavailable', 'rule_operator_unsupported',
];

export type MessageParams = Record<string, string | number | undefined>;
export type Message = string | ((params: MessageParams) => string);
export type ValidationMessages = Record<IssueCode, Message>;

export interface Issue {
  code: IssueCode;
  params?: MessageParams;
}

/** English. A text that does not match its pattern says what is expected (see `formatHint`). */
export const en: ValidationMessages = {
  required: 'Required',
  invalid_type: 'Invalid value',
  invalid_format: ({ pattern }) => formatHint(pattern as string | undefined, 'en') ?? 'Invalid format',
  decimal_format: 'Enter a number using digits and an optional decimal point, for example 1500.25',
  date_format: 'Use the format YYYY-MM-DD, for example 2026-10-06',
  datetime_format: 'Use YYYY-MM-DDThh:mm:ss followed by Z or an offset such as +02:00, for example 2026-10-06T09:30:00Z',
  time_format: 'Use hh:mm:ss, with fractions of a second and Z or an offset such as +02:00 if needed, for example 09:30:00Z',
  year_format: 'Use a 4-digit year, for example 2026',
  too_short: 'Must be at least {min} characters',
  too_long: 'Must be at most {max} characters',
  too_few_items: 'At least {min} required',
  too_many_items: 'At most {max} allowed',
  not_allowed_value: 'Not an allowed value',
  select_one: 'Select one option',
  not_allowed_here: 'Not allowed here',
  fraction_digits: 'At most {max} fraction digits',
  total_digits: 'At most {max} digits in total',
  min_inclusive: 'Must be at least {min}',
  invalid: 'Invalid value',
  rule_literal_not_code_value: 'literal "{value}" is not a value of a code set at {path}',
  rule_path_unknown: '{path} is not a field of this type, so the rule cannot be checked',
  rule_code_list_unavailable: 'code list {list} is not available',
  rule_operator_unsupported: 'operator {op} is not supported',
};

const plural = (n: number | string | undefined, one: string, many: string): string => (Number(n) === 1 ? one : many);

export const es: ValidationMessages = {
  required: 'Obligatorio',
  invalid_type: 'Valor no válido',
  invalid_format: ({ pattern }) => formatHint(pattern as string | undefined, 'es') ?? 'Formato no válido',
  decimal_format: 'Introduzca un número con dígitos y, opcionalmente, un punto decimal, por ejemplo 1500.25',
  date_format: 'Use el formato AAAA-MM-DD, por ejemplo 2026-10-06',
  datetime_format: 'Use AAAA-MM-DDThh:mm:ss seguido de Z o de un desfase como +02:00, por ejemplo 2026-10-06T09:30:00Z',
  time_format: 'Use hh:mm:ss, con fracciones de segundo y Z o un desfase como +02:00 si hace falta, por ejemplo 09:30:00Z',
  year_format: 'Use un año de 4 dígitos, por ejemplo 2026',
  too_short: ({ min }) => `Debe tener al menos ${min} ${plural(min, 'carácter', 'caracteres')}`,
  too_long: ({ max }) => `Debe tener como máximo ${max} ${plural(max, 'carácter', 'caracteres')}`,
  too_few_items: 'Se requieren al menos {min}',
  too_many_items: 'Se permiten como máximo {max}',
  not_allowed_value: 'Valor no permitido',
  select_one: 'Seleccione una opción',
  not_allowed_here: 'No permitido aquí',
  fraction_digits: ({ max }) => `Como máximo ${max} ${plural(max, 'decimal', 'decimales')}`,
  total_digits: ({ max }) => `Como máximo ${max} ${plural(max, 'dígito', 'dígitos')} en total`,
  min_inclusive: 'Debe ser al menos {min}',
  invalid: 'Valor no válido',
  rule_literal_not_code_value: 'el literal "{value}" no es un valor de un conjunto de códigos en {path}',
  rule_path_unknown: '{path} no es un campo de este tipo, por lo que la regla no se puede comprobar',
  rule_code_list_unavailable: 'la lista de códigos {list} no está disponible',
  rule_operator_unsupported: 'el operador {op} no es compatible',
};

/** Languages shipped with the library. Add more by passing your own catalog to `createMessages`. */
export const validationLocales: Record<string, ValidationMessages> = { en, es };

/**
 * Catalog for a locale. Resolution: exact tag (`es-MX`), then its language (`es`), then English;
 * `overrides` win over everything, and anything missing falls back to English.
 */
export function createMessages(
  locale = 'en',
  overrides: Partial<ValidationMessages> = {},
  locales: Record<string, Partial<ValidationMessages>> = validationLocales,
): ValidationMessages {
  const lang = locale.split('-')[0] ?? 'en';
  return { ...en, ...locales[lang], ...locales[locale], ...overrides };
}

export function formatMessage(message: Message, params: MessageParams = {}): string {
  if (typeof message === 'function') return message(params);
  return message.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function formatIssue(issue: Issue, messages: ValidationMessages = en): string {
  return formatMessage(messages[issue.code] ?? en[issue.code] ?? en.invalid, issue.params);
}
