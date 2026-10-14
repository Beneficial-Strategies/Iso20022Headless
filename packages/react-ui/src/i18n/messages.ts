import { formatMessage, type MessageParams } from '@beneficial-strategies/iso20022-validate';

export { plural } from './plural.ts';

export type UiMessage = string | ((p: MessageParams) => string);

/** The text the library's own controls show. A host's page chrome (dialogs, banners, buttons) is its own to write; the demos' is in apps/demo-shared. */
const KEYS = [
  'required', 'optional', 'remove', 'add', 'removeItem', 'now', 'nowAria', 'chooseOne', 'select', 'include',
  'aboutLabel', 'listRequired', 'currencyOf', 'amountOf', 'options', 'rawXml', 'errorPrefix', 'englishNote', 'machineNote',
  // the small button beside the "i" that opens a type's official page, and the hint in the help popup
  'specTip', 'helpClickHint',
] as const;

export type UiKey = (typeof KEYS)[number];
export type UiMessages = Record<UiKey, UiMessage>;
export const UI_KEYS: readonly UiKey[] = KEYS;

/** Language names are shown in their own language so a user can always find theirs. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English (ISO)',
  'en-US': 'English (US)',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
};

export const uiEn: UiMessages = {
  required: '(required)',
  optional: '(optional)',
  remove: 'Remove',
  add: '+ Add {label}',
  removeItem: 'Remove {label} {n}',
  now: 'Now',
  nowAria: 'Set {label} to the current local time',
  chooseOne: '{label} — choose one',
  select: '— select —',
  include: 'Include {label}',
  aboutLabel: 'About {label}',
  listRequired: 'required, ',
  currencyOf: '{label} currency',
  amountOf: '{label} amount',
  options: 'Options',
  rawXml: '<xml/> (raw XML)',
  errorPrefix: 'Error:',
  englishNote: 'Shown in English (not translated)',
  machineNote: 'Machine translated, not yet reviewed',
  specTip: 'View ISO 20022 official documentation for {type}',
  helpClickHint: 'Click to view in form',
};

/** English is the only language the library carries. Any other language is a text host's, passed as `locales` (see createUiMessages) or as `I18nOverrides.ui`. */
export const uiLocales: Record<string, Partial<UiMessages>> = {
  en: uiEn,
};

export function createUiMessages(locale: string, overrides: Partial<UiMessages> = {}, locales: Record<string, Partial<UiMessages>> = uiLocales): UiMessages {
  const lang = locale.split('-')[0] ?? 'en';
  return { ...uiEn, ...locales[lang], ...locales[locale], ...overrides };
}

/** Text for a key, or an empty string for a key nobody defined (callers can then fall back). */
export function translate(messages: UiMessages, key: UiKey, params?: MessageParams): string {
  const m = messages[key] ?? uiEn[key];
  return m === undefined ? '' : formatMessage(m, params);
}
