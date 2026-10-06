import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';
import { createMessages, formatIssues, initialValue, pruneForValidation } from '@beneficial-strategies/iso20022-validate';
import { serializeFragment, serializeFragmentIsoJson } from '@beneficial-strategies/iso20022-serialize';

export const TYPE = 'BranchAndFinancialInstitutionIdentification8';
const messages = createMessages('en'); // or 'es'

/** An empty value of the right shape: use it as your form state. */
export const newValue = () => initialValue(typeDescriptors, TYPE);

/** Validation messages by field path, e.g. errors["FinancialInstitutionIdentification.BICFI"]. */
export function check(value: unknown): Record<string, string> {
  const result = schemas[TYPE]!.safeParse(pruneForValidation(typeDescriptors, TYPE, value));
  return result.success ? {} : formatIssues(result.error, messages);
}

/** The value as ISO 20022 XML or JSON. Call it when check(value) returns no errors. */
export function toOutput(value: unknown) {
  const xml = serializeFragment(typeDescriptors, TYPE, value);
  const json = serializeFragmentIsoJson(typeDescriptors, TYPE, value);
  return { xml, json };
}
