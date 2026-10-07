import { useI18n } from '@beneficial-strategies/iso20022-react-ui';

/**
 * The demo's own wording (not the form library's): the "Copy as" menu and the words in what it copies. English and Spanish.
 * Keeping it here, not in the library's catalog, means the library stays generic and the demos' text is controlled from outside.
 */
const EN = {
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
  statusFilled: 'filled',
  statusEmpty: 'empty',
  statusGroup: 'section',
  statusExcluded: 'not included',
  statusList: 'list',
  statusChoice: 'choice',
  yes: 'yes',
  no: 'no',
} as const;

export type DemoKey = keyof typeof EN;

const ES: Record<DemoKey, string> = {
  copyAs: 'Copiar como',
  copyAsTitle: 'Copiar lo que muestra el formulario ahora, en un formato para su documento o herramienta',
  copyAsMenu: 'Copiar la pantalla como',
  optDefinitions: 'Incluir las definiciones de ISO 20022',
  optExcluded: 'Mostrar las secciones opcionales que no están incluidas',
  optEmpty: 'Mostrar los elementos opcionales que están vacíos',
  fmtWord: 'Word / texto enriquecido',
  fmtWordDesc: 'Una tabla que se pega en Word, Outlook o Google Docs',
  fmtMarkdown: 'Markdown',
  fmtMarkdownDesc: 'Un esquema para wikis, GitHub, Confluence y chats',
  fmtSpreadsheet: 'Hoja de cálculo',
  fmtSpreadsheetDesc: 'Filas que se pegan en Excel o Google Sheets: un diccionario de datos de la pantalla',
  fmtOutline: 'Esquema de texto',
  fmtOutlineDesc: 'Un árbol con sangría de la pantalla',
  fmtJson: 'JSON',
  fmtJsonDesc: 'La misma estructura, para herramientas',
  fmtImage: 'Imagen (PNG)',
  fmtImageDesc: 'Una imagen del formulario, para cualquier documento',
  fmtFigma: 'SVG para Figma',
  fmtFigmaDesc: 'Pegue en un lienzo de Figma (Ctrl/⌘+V): capas editables con los nombres de los elementos ISO, en estilo de boceto',
  fmtSvgFile: 'Archivo SVG',
  fmtSvgFileDesc: 'El mismo dibujo guardado como archivo, para arrastrarlo a Figma',
  saved: 'Se guardó {format}',
  include: 'Incluir',
  add: 'Añadir',
  copied: 'Copiado como {format}',
  copiedDownload: 'Se guardó {format} como archivo (este navegador no lo copió)',
  copyFailed: 'No se pudo copiar: {why}',
  required: 'obligatorio',
  optional: 'opcional',
  notIncluded: 'no incluido',
  empty: '(vacío)',
  noneChosen: '(nada elegido)',
  items: '{n} elementos',
  oneItem: '1 elemento',
  list: 'lista',
  error: 'Error',
  colElement: 'Elemento',
  colRequired: 'Obligatorio',
  colValue: 'Valor',
  colDefinition: 'Definición',
  colPath: 'Ruta',
  colIso: 'Elemento ISO',
  colType: 'Tipo ISO',
  colKind: 'Clase',
  colStatus: 'Estado',
  colError: 'Error',
  colLevel: 'Nivel',
  statusFilled: 'con valor',
  statusEmpty: 'vacío',
  statusGroup: 'sección',
  statusExcluded: 'no incluido',
  statusList: 'lista',
  statusChoice: 'elección',
  yes: 'sí',
  no: 'no',
};

export type DemoText = (key: DemoKey, params?: Record<string, string | number>) => string;

/** The text function for a language (English for any language without a table). Plain, so exports can be built and tested without React. */
export function demoText(lang: string): DemoText {
  const table: Record<DemoKey, string> = lang.split('-')[0] === 'es' ? ES : EN;
  return (key, params) => (params ? table[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : table[key]);
}

export function useDemoText(): DemoText {
  const { lang } = useI18n();
  return demoText(lang);
}
