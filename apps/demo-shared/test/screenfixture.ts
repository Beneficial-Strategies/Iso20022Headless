import { pain001Message } from '@beneficial-strategies/iso20022-validate/pain001';
import { createDefinitions, definitionLocales } from '@beneficial-strategies/iso20022-validate/definitions';
import { loadDefinitionCatalog } from '@beneficial-strategies/iso20022-validate/locales';
import type { FormApi } from '@beneficial-strategies/iso20022-react-ui';

/** A form over the group header of pain.001 with some data, the way the screen would hold it. Only what the model reads is real. */
export function groupHeaderForm(values: unknown, errors: Record<string, string> = {}, rootType = 'GroupHeader114'): FormApi {
  const at = (path: string): unknown =>
    path === ''
      ? values
      : path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .filter(Boolean)
          .reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), values);
  return {
    typeDescriptors: pain001Message.typeDescriptors,
    rootType,
    values,
    errors,
    allErrors: errors,
    isValid: Object.keys(errors).length === 0,
    getValue: at,
    getChoice: (path) => {
      const v = at(path);
      return v && typeof v === 'object' ? Object.keys(v as object)[0] : undefined;
    },
    isPresent: (path) => at(path) !== undefined,
    getFieldProps: () => {
      throw new Error('not used');
    },
    selectChoice: () => {},
    setPresent: () => {},
    addListItem: () => {},
    removeListItem: () => {},
    touchAll: () => {},
    setValues: () => {},
  };
}

export const defsEn = createDefinitions('en');
// the Spanish text is loaded on demand, as the app does
export const defsEs = createDefinitions('es', {}, { ...definitionLocales, es: await loadDefinitionCatalog('es') });
