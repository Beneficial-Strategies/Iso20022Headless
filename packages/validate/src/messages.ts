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

export type IssueCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'decimal_format'
  | 'date_format'
  | 'datetime_format'
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
  | 'rule_code_list_unavailable'
  | 'rule_operator_unsupported';

export const ISSUE_CODES: readonly IssueCode[] = [
  'required', 'invalid_type', 'invalid_format', 'decimal_format', 'date_format', 'datetime_format', 'year_format',
  'too_short', 'too_long', 'too_few_items', 'too_many_items', 'not_allowed_value', 'select_one', 'not_allowed_here',
  'fraction_digits', 'total_digits', 'min_inclusive', 'invalid',
  'rule_literal_not_code_value', 'rule_code_list_unavailable', 'rule_operator_unsupported',
];

export type MessageParams = Record<string, string | number | undefined>;
export type Message = string | ((params: MessageParams) => string);
export type ValidationMessages = Record<IssueCode, Message>;

export interface Issue {
  code: IssueCode;
  params?: MessageParams;
}

/** English. Wording is the library's historical default; formats share "Invalid format". */
export const en: ValidationMessages = {
  required: 'Required',
  invalid_type: 'Invalid value',
  invalid_format: 'Invalid format',
  decimal_format: 'Invalid format',
  date_format: 'Invalid format',
  datetime_format: 'Invalid format',
  year_format: 'Invalid format',
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
  rule_code_list_unavailable: 'code list {list} is not available',
  rule_operator_unsupported: 'operator {op} is not supported',
};

const plural = (n: number | string | undefined, one: string, many: string): string => (Number(n) === 1 ? one : many);

export const es: ValidationMessages = {
  required: 'Obligatorio',
  invalid_type: 'Valor no válido',
  invalid_format: 'Formato no válido',
  decimal_format: 'Formato no válido',
  date_format: 'Formato no válido',
  datetime_format: 'Formato no válido',
  year_format: 'Formato no válido',
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
