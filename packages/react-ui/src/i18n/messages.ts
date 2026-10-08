import { formatMessage, type MessageParams } from '@beneficial-strategies/iso20022-validate';
import { uiDe } from './ui.de.ts';
import { uiFr } from './ui.fr.ts';
import { uiPt } from './ui.pt.ts';

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



export const uiEs: UiMessages = {
  required: '(obligatorio)',
  optional: '(opcional)',
  remove: 'Quitar',
  add: '+ Añadir {label}',
  removeItem: 'Quitar {label} {n}',
  now: 'Ahora',
  nowAria: 'Establecer {label} en la hora local actual',
  chooseOne: '{label} — elija uno',
  select: '— seleccione —',
  include: 'Incluir {label}',
  aboutLabel: 'Acerca de {label}',
  listRequired: 'obligatorio, ',
  currencyOf: 'Moneda de {label}',
  amountOf: 'Importe de {label}',
  options: 'Opciones',
  rawXml: '<xml/> (XML sin procesar)',
  errorPrefix: 'Error:',
  englishNote: 'Se muestra en inglés (sin traducir)',
  machineNote: 'Traducción automática, pendiente de revisión',
  specTip: 'Ver la documentación oficial de ISO 20022 de {type}',
  helpClickHint: 'Haga clic para verlo en el formulario',
};

/** Languages shipped with the library. Others can be added through `createI18n` / `DemoApp`'s `i18n` prop. */
export const uiLocales: Record<string, Partial<UiMessages>> = {
  en: uiEn,
  // American English changes the ISO text's spelling and a few terms (see the validate package's `enUS`); the interface wording needs nothing of its own
  'en-US': {},
  es: uiEs,
  fr: uiFr,
  de: uiDe,
  pt: uiPt,
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
