import { createContext, useContext, useMemo } from 'react';
import { useI18n } from '@beneficial-strategies/iso20022-react-ui';
import { formatIcu } from './icu.ts';

/**
 * The demo's own wording (not the form library's): the "Copy as" menu and the words in what it copies. English, Spanish, French, German and Portuguese; any other language uses the English.
 * Keeping it here, not in the library's catalog, means the library stays generic and the demos' text is controlled from outside.
 */
const EN = {
  // hover help for the controls at the top
  helpAreaTitle: 'Business area',
  helpArea: 'ISO 20022 groups its messages into business areas, such as payments initiation (pain), clearing and settlement (pacs) and ATM management (caam). Choose an area to see its messages.',
  helpMessageTitle: 'Message',
  helpMessage: 'The ISO 20022 message to explore, by its identifier (area, function, flavour and version). Choose one to see every element it can hold.',
  helpTypeTitle: 'What the form shows',
  helpType: 'The whole message, or just one part of it. Choose a part to work on it alone, the same as the magnifier beside an element does.',
  helpDisplayTitle: 'Display settings',
  helpDisplay: 'Language, light or dark theme, text size, density, whether the output is XML or JSON, and the style of the form.',
  // the menu
  copyAs: 'Copy as',
  copyAsTitle: 'Copy what the form shows now, in a format for your document or tool',
  copyAsMenu: 'Copy the screen as',
  optDefinitions: 'Include the ISO 20022 definitions',
  optExcluded: 'Show optional sections that are not included',
  optEmpty: 'Show optional elements left empty',
  fmtWord: 'Word / rich text',
  fmtWordDesc: 'A table that pastes into Word, Outlook or Google Docs',
  fmtMarkdown: 'Markdown',
  fmtMarkdownDesc: 'An outline for wikis, GitHub, Confluence and chat',
  fmtSpreadsheet: 'Spreadsheet',
  fmtSpreadsheetDesc: 'Rows that paste into Excel or Google Sheets: a data dictionary of the screen',
  fmtOutline: 'Plain-text outline',
  fmtOutlineDesc: 'An indented tree of the screen',
  fmtJson: 'JSON',
  fmtJsonDesc: 'The same structure, for tools',
  fmtImage: 'Image (PNG)',
  fmtImageDesc: 'A picture of the form, for any document',
  fmtFigma: 'SVG for Figma',
  fmtFigmaDesc: 'Paste onto a Figma canvas (Ctrl/⌘+V): editable layers named after the ISO elements, in a wireframe style',
  fmtSvgFile: 'SVG file',
  fmtSvgFileDesc: 'The same drawing saved as a file, to drag into Figma',
  saved: 'Saved {format}',
  include: 'Include',
  add: 'Add',
  fieldModeTitle: 'Field mode of {element}: {mode}. Click to change it.',
  fieldModeMenu: 'Field mode',
  fieldModeTipTitle: 'Field mode: {mode}',
  fieldModeTip: 'How this element is presented in the screen you are designing. Editable: the usual control. Label: shown as text, not editable. Hidden: not shown, but whatever value you leave here stays in the message as its default. Click to choose.',
  modeEditable: 'Editable',
  modeEditableDesc: 'The usual control',
  modeLabel: 'Label',
  modeLabelDesc: 'Shown as text, not editable',
  modeHidden: 'Hidden',
  modeHiddenDesc: 'Not shown; the value you leave here stays in the message',
  previewAsDesigned: 'Preview as designed',
  previewTitle: 'Show labels as text and leave out hidden elements, as an application using these modes would. Off: everything stays editable and the others are shaded.',
  copied: 'Copied as {format}',
  copiedDownload: 'Saved {format} as a file (this browser would not copy it)',
  copyFailed: 'Could not copy: {why}',
  // the words in what is copied
  required: 'required',
  optional: 'optional',
  notIncluded: 'not included',
  empty: '(empty)',
  noneChosen: '(nothing chosen)',
  items: '{n} items',
  oneItem: '1 item',
  list: 'list',
  error: 'Error',
  colElement: 'Element',
  colRequired: 'Required',
  colValue: 'Value',
  colDefinition: 'Definition',
  colPath: 'Path',
  colIso: 'ISO element',
  colType: 'ISO type',
  colKind: 'Kind',
  colStatus: 'Status',
  colError: 'Error',
  colLevel: 'Level',
  colMode: 'Mode',
  modeWordLabel: 'label',
  modeWordHidden: 'hidden',
  statusFilled: 'filled',
  statusEmpty: 'empty',
  statusGroup: 'section',
  statusExcluded: 'not included',
  statusList: 'list',
  statusChoice: 'choice',
  yes: 'yes',
  no: 'no',
  zoomLabel: 'Zoom in to {type}',
  zoomShort: 'Zoom',
  zoomTip: 'This message subset is based upon the ISO 20022 type {type}. If you are adding or editing lookup values that may be persisted somewhere, you might need a control based on this subset of message data. Click Zoom to zoom in to that data type in isolation from the outer message.',
} as const;

export type DemoKey = keyof typeof EN;

export type DemoText = (key: DemoKey, params?: Record<string, string | number>) => string;

/** Tables by language: English only. Every other language is a text host's, passed as `overrides` (textHost.ts). */
export const demoTextTables: Record<string, Record<DemoKey, string>> = { en: EN };

/** The text function for a locale: its language's table (`es-MX` uses `es`), else the English, with `overrides` (for example from a text host) on top. Plain, so exports can be built and tested without React. */
export function demoText(locale: string, overrides?: Partial<Record<DemoKey, string>>, tables: Record<string, Record<DemoKey, string>> = demoTextTables): DemoText {
  const table = { ...(tables[locale.split('-')[0] ?? 'en'] ?? EN), ...overrides };
  return (key, params) => (params ? formatIcu(table[key], params) : table[key]);
}

/** Text for the current language that a host supplies (see textHost.ts); absent means the tables above. */
export const DemoTextOverridesContext = createContext<Partial<Record<DemoKey, string>> | undefined>(undefined);

export function useDemoText(): DemoText {
  const { locale } = useI18n();
  const overrides = useContext(DemoTextOverridesContext);
  return useMemo(() => demoText(locale, overrides), [locale, overrides]);
}
