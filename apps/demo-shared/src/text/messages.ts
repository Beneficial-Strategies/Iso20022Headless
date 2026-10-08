import { useMemo } from 'react';
import { formatMessage, type MessageParams } from '@beneficial-strategies/iso20022-validate';
import { useI18n, type I18n, type UiKey } from '@beneficial-strategies/iso20022-react-ui';
import { pageDe } from './page.de.ts';
import { pageEn } from './page.en.ts';
import { pageEs } from './page.es.ts';
import { pageFr } from './page.fr.ts';
import { pagePt } from './page.pt.ts';

/**
 * The demos' own text: page chrome, dialogs, the banner, buttons. It is not the library's. The library's controls
 * (required, optional, Add, Remove, the help popups...) are translated by the library; a host that embeds the
 * controls writes its own page text. These catalogs fall back to the demo's English, not to the ISO text.
 */
const KEYS = [
  'copyXml', 'copied', 'xml', 'valid', 'draft', 'doneEditing',
  'looksComplete', 'problemsRemain', 'typeLabel', 'typeSearch', 'noMatch', 'wholeMessage',
  'findType', 'title_form', 'blurb_form', 'title_zod', 'blurb_zod', 'rulesTitle',
  'rulesNoneViolated', 'rulesViolated', 'ruleCounts', 'status_pass', 'status_fail', 'status_unsupported',
  'status_prose-only', 'display', 'displayDialog', 'theme', 'theme_system', 'theme_light',
  'theme_dark', 'themeHint', 'textSize', 'size_normal', 'size_large', 'size_xlarge',
  'density', 'density_comfortable', 'density_compact', 'skinLegend', 'skin_tailwind', 'skin_tailwind_desc',
  'skin_plain', 'skin_plain_desc', 'language', 'lang_auto', 'reportWording', 'outputFormat',
  'format_xml', 'format_json', 'formatHint', 'copyJson', 'messageLabel', 'loading',
  'settingsNote', 'implement', 'implementTitle', 'implementIntro', 'implementUnpublished', 'stackLabel',
  'stackReact', 'stackVue', 'stackSvelte', 'stackOther', 'stylingLabel', 'stylingTailwind',
  'extrasLabel', 'extrasOutput', 'pmLabel', 'close', 'copy', 'copiedShort',
  'stepInstall', 'stepComponent', 'stepUse', 'stepStyles', 'stepCore', 'stepCoreVue',
  'stepCoreSvelte', 'noteRenderer', 'noteLanguage', 'noteTailwind', 'noteCoreFields', 'pickStack',
  'pasteXml', 'pasteJson', 'paste', 'pasteNoData', 'pasteBlocked', 'pasteUnknown',
  'pasteDone', 'pasteDoneIssues', 'pasteSwitched', 'pasteFailed', 'pasteDismiss', 'pasteMoreIssues',
  'pasteError_empty', 'pasteError_not_xml_or_json', 'pasteError_unknown_namespace', 'pasteError_xml_syntax', 'pasteError_json_syntax', 'pasteError_not_json_object',
  'pasteError_wrong_root', 'pasteError_wrong_body', 'pasteError_whole_message_for_part', 'pasteError_fragment_mismatch', 'pasteError_clipboard_unreadable', 'pasteIssue_unknown_element',
  'pasteIssue_duplicate_element', 'pasteIssue_multiple_choices', 'pasteIssue_unexpected_text', 'pasteIssue_unexpected_element', 'loadFile', 'saveXml',
  'saveJson', 'fileDone', 'fileDoneIssues', 'fileFailed', 'fileError_empty', 'fileError_not_xml_or_json',
  'fileError_unreadable', 'fileError_too_large', 'stepServe', 'noteServe', 'areaLabel', 'areaName_pain',
  'areaDesc_pain', 'areaName_pacs', 'areaDesc_pacs', 'areaName_caam', 'areaDesc_caam', 'xsdLabel',
  'xsdReady', 'xsdReadyFile', 'xsdLoading', 'xsdUnavailable', 'xsdNeedsXml', 'xsdNotSchema',
  'xsdWrongSchema', 'xsdReadFailed', 'xsdPanelTitle', 'xsdValid', 'xsdOneError', 'xsdErrors',
  'xsdChecking', 'xsdEngineFailed', 'xsdClose', 'xsdLine', 'xsdLoadOther', 'xsdSchemaFrom',
  'bannerTitle', 'logoAlt', 'logoLink', 'aboutOpen', 'aboutTitle', 'aboutIntro',
  'aboutClose', 'aboutStart', 'aboutExploreTitle', 'aboutExploreBody', 'aboutCreateTitle', 'aboutCreateBody',
  'aboutSaveTitle', 'aboutSaveBody', 'aboutIllustrateTitle', 'aboutIllustrateBody', 'aboutBuildTitle', 'aboutBuildBody',
  'aboutFootnote',
] as const;

export type PageKey = (typeof KEYS)[number];
export type PageMessage = string | ((p: MessageParams) => string);
export type PageMessages = Record<PageKey, PageMessage>;
export const PAGE_KEYS: readonly PageKey[] = KEYS;

/** Per language tag. American English has no wording of its own here, so it uses the demo's English. */
export const pageLocales: Record<string, Partial<PageMessages>> = {
  en: pageEn,
  'en-US': {},
  es: pageEs,
  fr: pageFr,
  de: pageDe,
  pt: pagePt,
};

/** Resolution: `overrides`, the exact tag (`es-MX`), its language (`es`), then the demo's English. */
export function createPageMessages(locale: string, overrides: Partial<PageMessages> = {}, locales: Record<string, Partial<PageMessages>> = pageLocales): PageMessages {
  const lang = locale.split('-')[0] ?? 'en';
  return { ...pageEn, ...locales[lang], ...locales[locale], ...overrides };
}

/** Keys that fell through to the demo's English for a locale (to spot untranslated text in tests). */
export function untranslatedPageKeys(locale: string, locales: Record<string, Partial<PageMessages>> = pageLocales): PageKey[] {
  const lang = locale.split('-')[0] ?? 'en';
  const own = { ...locales[lang], ...locales[locale] };
  return PAGE_KEYS.filter((k) => !(k in own));
}

export interface PageText {
  /** Demo text for a demo key, or the library's text for a library key, so call sites need not care which is which. */
  t: (key: PageKey | UiKey, params?: MessageParams) => string;
}

const isPageKey = (key: string): key is PageKey => (PAGE_KEYS as readonly string[]).includes(key);

/** Per-locale demo catalogs a host may add to or correct: `{ fr: { close: 'Fermer' } }`. */
export type PageTextOverrides = Record<string, Partial<PageMessages>>;

/** Demo keys from the demo catalog, library keys from the library's. A key nobody defined reads as an empty string. */
export function makePageText(i18n: Pick<I18n, 'locale' | 't'>, overrides?: PageTextOverrides): PageText {
  const messages = createPageMessages(i18n.locale, {}, mergeLocales(pageLocales, overrides));
  return {
    t: (key, params) => {
      if (!isPageKey(key)) return i18n.t(key, params);
      const m = messages[key];
      return m === undefined ? '' : formatMessage(m, params);
    },
  };
}

/** The text function for the current language. */
export function usePageText(overrides?: PageTextOverrides): PageText {
  const i18n = useI18n();
  return useMemo(() => makePageText(i18n, overrides), [i18n, overrides]);
}

function mergeLocales(base: Record<string, Partial<PageMessages>>, extra: PageTextOverrides = {}): Record<string, Partial<PageMessages>> {
  const out = { ...base };
  for (const [tag, catalog] of Object.entries(extra)) out[tag] = { ...out[tag], ...catalog };
  return out;
}
