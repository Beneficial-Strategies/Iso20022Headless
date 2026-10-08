import { patternMaxLength, type TypeDescriptor } from '@beneficial-strategies/iso20022-validate';

/**
 * How wide a control for a type should be, in characters, so that a country code is not as wide as a name: from what the type
 * allows (its longest value, its digits, the longest of its options). `undefined` means the full width: no limit is known, or the
 * value can be long. The skin widens this a little (letters are wider than digits) so that text is never cut off.
 */
export const MIN_CHARS = 8;
/** Beyond this many characters a control just takes the full width. */
export const FULL_ABOVE = 80;

const clamp = (n: number | undefined): number | undefined => (n === undefined || n > FULL_ABOVE ? undefined : Math.max(MIN_CHARS, n));

/** The longest a value of a text type can be: its length limit, or what its pattern allows, whichever is smaller. */
function textLimit(type: TypeDescriptor): number | undefined {
  const fromPattern = type.pattern ? patternMaxLength(type.pattern) : undefined;
  const lengths = [type.maxLength, fromPattern].filter((n): n is number => n !== undefined);
  return lengths.length ? Math.min(...lengths) : undefined;
}

/** `labels` are the texts of a dropdown's options, when the control is one: the control is as wide as the longest. */
export function controlChars(type: TypeDescriptor, labels?: readonly string[]): number | undefined {
  if (labels && labels.length > 0) return clamp(Math.max(...labels.map((l) => l.length)) + 2);
  switch (type.kind) {
    case 'text':
    case 'code':
      return clamp(textLimit(type));
    case 'boolean':
      return 12;
    case 'number':
    case 'amount':
      // the digits, a decimal point and a sign
      return clamp((type.totalDigits ?? 18) + 2);
    case 'date':
      return 16;
    case 'datetime':
      return 30;
    case 'time':
      return 18;
    default:
      return undefined;
  }
}
