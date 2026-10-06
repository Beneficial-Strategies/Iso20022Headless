import { formatMessage, type MessageParams } from '@beneficial-strategies/iso20022-validate';

export type UiMessage = string | ((p: MessageParams) => string);

const KEYS = [
  // generic form chrome
  'required', 'optional', 'remove', 'add', 'removeItem', 'now', 'nowAria', 'chooseOne', 'select', 'include',
  'aboutLabel', 'listRequired', 'currencyOf', 'amountOf', 'copyXml', 'copied', 'options', 'rawXml', 'errorPrefix', 'englishNote', 'machineNote',
  // page
  'xml', 'valid', 'draft', 'doneEditing', 'looksComplete', 'problemsRemain', 'typeLabel', 'typeSearch', 'noMatch',
  'wholeMessage', 'findType', 'title_form', 'blurb_form', 'title_zod', 'blurb_zod',
  // business rules
  'rulesTitle', 'rulesNoneViolated', 'rulesViolated', 'ruleCounts', 'status_pass', 'status_fail', 'status_unsupported', 'status_prose-only',
  // settings
  'display', 'displayDialog', 'theme', 'theme_system', 'theme_light', 'theme_dark', 'themeHint', 'textSize', 'size_normal',
  'size_large', 'size_xlarge', 'density', 'density_comfortable', 'density_compact', 'skinLegend', 'skin_tailwind',
  'skin_tailwind_desc', 'skin_plain', 'skin_plain_desc', 'language', 'lang_auto', 'outputFormat', 'format_xml', 'format_json', 'formatHint', 'copyJson', 'settingsNote',
] as const;

export type UiKey = (typeof KEYS)[number];
export type UiMessages = Record<UiKey, UiMessage>;
export const UI_KEYS: readonly UiKey[] = KEYS;

/** Language names are shown in their own language so a user can always find theirs. */
export const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español' };

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
  copyXml: 'Copy XML',
  copied: 'Copied',
  options: 'Options',
  rawXml: '<xml/> (raw XML)',
  errorPrefix: 'Error:',
  englishNote: 'Shown in English (not translated)',
  machineNote: 'Machine translated, not yet reviewed',
  xml: 'XML',
  valid: 'valid',
  draft: 'draft — {n} problem(s)',
  doneEditing: 'Done editing',
  looksComplete: 'Looks complete.',
  problemsRemain: '{n} problem(s) remain.',
  typeLabel: 'Type: ',
  typeSearch: 'Search types… (e.g. PostalAddress, Party, Choice)',
  noMatch: 'No match',
  wholeMessage: '(whole message, {id})',
  findType: 'Find an ISO 20022 type',
  title_form: 'ISO 20022 headless — with our TanStack Form hook',
  blurb_form:
    'State comes from @beneficial-strategies/iso20022-react (TanStack Form underneath). Validation is the generated Zod schema; the hook returns props to spread and renders nothing — every pixel here is the demo\'s own markup.',
  title_zod: 'ISO 20022 headless — Zod only (no form library)',
  blurb_zod:
    'Same UI, same generated Zod schema, but form state is ~80 lines of plain React in src/useZodForm.ts — no TanStack, no @beneficial-strategies/iso20022-react. Compare with the other demo to see what the hook buys you.',
  rulesTitle: 'Business rules ({status})',
  rulesNoneViolated: 'none violated',
  rulesViolated: '{n} violated',
  ruleCounts: '{pass} {status_pass}, {fail} {status_fail}, {unsupported} {status_unsupported}, {prose} {status_prose}',
  status_pass: 'passes',
  status_fail: 'violated',
  status_unsupported: 'cannot be checked automatically',
  'status_prose-only': 'guideline (not machine-checkable)',
  display: 'Display ▾',
  displayDialog: 'Display settings',
  theme: 'Theme',
  theme_system: 'System',
  theme_light: 'Light',
  theme_dark: 'Dark',
  themeHint: 'System follows your operating system setting.',
  textSize: 'Text size',
  size_normal: 'Normal',
  size_large: 'Large',
  size_xlarge: 'Extra large',
  density: 'Density',
  density_comfortable: 'Comfortable',
  density_compact: 'Compact',
  skinLegend: 'Form skin (the headless part)',
  skin_tailwind: 'Tailwind',
  skin_tailwind_desc: 'Utility-class styling with a custom accessible dropdown and help popovers.',
  skin_plain: 'Plain HTML',
  skin_plain_desc: 'Unstyled semantic HTML: fieldset, label, native select, details. Browser defaults only.',
  language: 'Language',
  lang_auto: 'Automatic (browser)',
  outputFormat: 'Output format',
  format_xml: 'XML',
  format_json: 'JSON',
  formatHint: 'JSON follows the ISO 20022 JSON syntax (TSG, June 2025): abbreviated tags, arrays for repeating elements, amounts as { amt, Ccy }.',
  copyJson: 'Copy JSON',
  settingsNote: 'Settings are kept in the page address, so a link reproduces this view.',
};

const plural = (n: number | string | undefined, one: string, many: string): string => (Number(n) === 1 ? one : many);

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
  copyXml: 'Copiar XML',
  copied: 'Copiado',
  options: 'Opciones',
  rawXml: '<xml/> (XML sin procesar)',
  errorPrefix: 'Error:',
  englishNote: 'Se muestra en inglés (sin traducir)',
  machineNote: 'Traducción automática, pendiente de revisión',
  xml: 'XML',
  valid: 'válido',
  draft: ({ n }) => `borrador — ${n} ${plural(n, 'problema', 'problemas')}`,
  doneEditing: 'Edición terminada',
  looksComplete: 'Parece completo.',
  problemsRemain: ({ n }) => (Number(n) === 1 ? 'Queda 1 problema.' : `Quedan ${n} problemas.`),
  typeLabel: 'Tipo: ',
  typeSearch: 'Buscar tipos… (p. ej. PostalAddress, Party, Choice)',
  noMatch: 'Sin coincidencias',
  wholeMessage: '(mensaje completo, {id})',
  findType: 'Buscar un tipo de ISO 20022',
  title_form: 'ISO 20022 headless — con nuestro hook de TanStack Form',
  blurb_form:
    'El estado proviene de @beneficial-strategies/iso20022-react (TanStack Form por debajo). La validación es el esquema Zod generado; el hook devuelve props para propagar y no dibuja nada: todo el marcado de esta página es propio del demo.',
  title_zod: 'ISO 20022 headless — solo Zod (sin biblioteca de formularios)',
  blurb_zod:
    'La misma interfaz y el mismo esquema Zod generado, pero el estado del formulario son unas 80 líneas de React simple en src/useZodForm.ts: sin TanStack ni @beneficial-strategies/iso20022-react. Compárelo con el otro demo para ver qué aporta el hook.',
  rulesTitle: 'Reglas de negocio ({status})',
  rulesNoneViolated: 'ninguna infringida',
  rulesViolated: ({ n }) => `${n} ${plural(n, 'infringida', 'infringidas')}`,
  ruleCounts: '{pass} {status_pass}, {fail} {status_fail}, {unsupported} {status_unsupported}, {prose} {status_prose}',
  status_pass: 'cumplen',
  status_fail: 'infringidas',
  status_unsupported: 'no se pueden comprobar automáticamente',
  'status_prose-only': 'directrices (no verificables automáticamente)',
  display: 'Pantalla ▾',
  displayDialog: 'Ajustes de pantalla',
  theme: 'Tema',
  theme_system: 'Sistema',
  theme_light: 'Claro',
  theme_dark: 'Oscuro',
  themeHint: 'Sistema sigue la configuración de su sistema operativo.',
  textSize: 'Tamaño del texto',
  size_normal: 'Normal',
  size_large: 'Grande',
  size_xlarge: 'Muy grande',
  density: 'Densidad',
  density_comfortable: 'Cómoda',
  density_compact: 'Compacta',
  skinLegend: 'Aspecto del formulario (la parte «headless»)',
  skin_tailwind: 'Tailwind',
  skin_tailwind_desc: 'Estilos con clases de utilidad, con lista desplegable accesible personalizada y ayudas emergentes.',
  skin_plain: 'HTML simple',
  skin_plain_desc: 'HTML semántico sin estilos: fieldset, label, select nativo y details. Solo los valores predeterminados del navegador.',
  language: 'Idioma',
  lang_auto: 'Automático (navegador)',
  outputFormat: 'Formato de salida',
  format_xml: 'XML',
  format_json: 'JSON',
  formatHint: 'JSON sigue la sintaxis JSON de ISO 20022 (TSG, junio de 2025): etiquetas abreviadas, matrices para elementos repetidos e importes como { amt, Ccy }.',
  copyJson: 'Copiar JSON',
  settingsNote: 'Los ajustes se guardan en la dirección de la página, de modo que un enlace reproduce esta vista.',
};

/** Languages shipped with the demo. Others can be added through `createI18n` / `DemoApp`'s `i18n` prop. */
export const uiLocales: Record<string, Partial<UiMessages>> = { en: uiEn, es: uiEs };

export function createUiMessages(locale: string, overrides: Partial<UiMessages> = {}, locales: Record<string, Partial<UiMessages>> = uiLocales): UiMessages {
  const lang = locale.split('-')[0] ?? 'en';
  return { ...uiEn, ...locales[lang], ...locales[locale], ...overrides };
}

/** Text for a key, or an empty string for a key nobody defined (callers can then fall back). */
export function translate(messages: UiMessages, key: UiKey, params?: MessageParams): string {
  const m = messages[key] ?? uiEn[key];
  return m === undefined ? '' : formatMessage(m, params);
}
