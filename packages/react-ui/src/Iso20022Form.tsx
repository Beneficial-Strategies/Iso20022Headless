import { useEffect, useRef } from 'react';
import type { ZodType } from 'zod';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import type { TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import { SchemaForm } from './SchemaForm.tsx';
import { I18nProvider, useCreateI18n, type I18nOverrides } from './i18n/context.tsx';
import { SkinProvider } from './skin/context.tsx';
import { plainSkin } from './skin/plain.tsx';
import type { Skin } from './skin/types.ts';

export interface Iso20022FormProps {
  /** The ISO type to edit, e.g. `BranchAndFinancialInstitutionIdentification8`, or a message's root type. */
  type: string;
  /** `schemas` and `typeDescriptors` from a message module, e.g. `@beneficial-strategies/iso20022-validate/pain001`. */
  schemas: Record<string, ZodType>;
  typeDescriptors: TypeDescriptors;
  /** Called with the current value (raw form state) whenever it changes. */
  onChange?: (value: unknown, state: { valid: boolean; errors: Record<string, string> }) => void;
  /** How the form looks. Default `plainSkin`: ordinary HTML controls, no CSS setup. `tailwindSkin` needs the theme CSS. */
  skin?: Skin;
  /** Language tag, e.g. `es`. English and Spanish are included; the spec text for a language loads when it is first used. */
  locale?: string;
  /** Replace any interface text, validation message or definition. See `I18nOverrides`. */
  overrides?: I18nOverrides;
}

/**
 * A ready-to-use form for one ISO 20022 type, with validation, prompts and definitions working.
 * It is a thin convenience over `useIso20022Form` + `SchemaForm`; use those directly for more control.
 */
export function Iso20022Form({ type, schemas, typeDescriptors, onChange, skin = plainSkin, locale = 'en', overrides }: Iso20022FormProps) {
  const schema = schemas[type];
  if (!schema) throw new Error(`Iso20022Form: unknown type "${type}". Use a type name from the message module's \`schemas\`.`);
  const i18n = useCreateI18n(locale, overrides);
  const form = useIso20022Form({ schema, typeDescriptors, rootType: type, messages: i18n.validation });

  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    latest.current?.(form.values, { valid: form.isValid, errors: form.allErrors });
  }, [form.values, form.isValid, form.allErrors]);

  return (
    <I18nProvider value={i18n}>
      <SkinProvider value={skin}>
        <SchemaForm form={form} />
      </SkinProvider>
    </I18nProvider>
  );
}
