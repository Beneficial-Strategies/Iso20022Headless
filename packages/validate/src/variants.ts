// Regional variants of the ISO English text. The ISO repository is written in British-style English
// ("Organisation", "Cheque"); `en` keeps that text exactly. A variant such as `en-US` is a small set of
// rewrite rules applied to the ISO text at display time. It never touches wire names (XML tags, ISO paths)
// or code values, only the words a person reads.

/** Rewrite rules for one English variant. */
export interface TextVariant {
  /** Word stems whose spelling changes: `authoris` -> `authoriz`. Matched at the start of a word, only before the listed suffixes. */
  stems?: { from: string; to: string; suffixes: string }[];
  /** Whole words (lowercase) swapped for another spelling or word: `cheque` -> `check`. Plural `s` is added as its own entry. */
  words?: Record<string, string>;
  /** Phrases swapped for other terms, matched case-insensitively on word boundaries: `Town Name` -> `City Name`. */
  phrases?: [phrase: string, replacement: string][];
}

const keepCase = (from: string, to: string): string => {
  if (from.length > 1 && from === from.toUpperCase()) return to.toUpperCase();
  return from[0] === from[0]!.toUpperCase() && from[0] !== from[0]!.toLowerCase() ? to[0]!.toUpperCase() + to.slice(1) : to;
};

/** Split a run of letters into its camel-case humps, so `ChequeNumber` is two words. */
const TOKEN = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g;

/** Apply a variant to a piece of ISO text. Pure and idempotent. */
export function applyVariant(text: string, v: TextVariant): string {
  let out = text;
  for (const [phrase, replacement] of v.phrases ?? []) {
    const re = new RegExp(`(?<![A-Za-z])${phrase.replace(/ /g, '\\s+')}(?![a-z])`, 'gi');
    out = out.replace(re, (m) => keepCase(m, replacement));
  }
  return out.replace(TOKEN, (token) => {
    const lower = token.toLowerCase();
    const word = v.words?.[lower];
    if (word !== undefined) return keepCase(token, word);
    for (const s of v.stems ?? []) {
      if (lower.startsWith(s.from) && new RegExp(`^(${s.suffixes})$`).test(lower.slice(s.from.length))) return keepCase(token, s.to + lower.slice(s.from.length));
    }
    return token;
  });
}

/**
 * American English. Spelling first (the words found in the ISO text), then a few terms Americans use differently.
 * The term swaps are judgement calls: each one is listed so it can be reviewed or removed.
 */
export const enUS: TextVariant = {
  stems: [
    { from: 'authoris', to: 'authoriz', suffixes: 'ation|ations|e|ed|es|ing' },
    { from: 'organis', to: 'organiz', suffixes: 'ational|ation|ations|e|ed|es|ing' },
    { from: 'initialis', to: 'initializ', suffixes: 'ation|ations|e|ed|es|ing' },
    { from: 'reinitialis', to: 'reinitializ', suffixes: 'ation|ations|e|ed|es|ing' },
    { from: 'desynchronis', to: 'desynchroniz', suffixes: 'ation|ations|e|ed|es|ing' },
    { from: 'synchronis', to: 'synchroniz', suffixes: 'ation|ations|e|ed|es|ing' },
    { from: 'recognis', to: 'recogniz', suffixes: 'ation|ations|e|ed|es|ing|able' },
    { from: 'unrecognis', to: 'unrecogniz', suffixes: 'ed|able' },
    { from: 'motoris', to: 'motoriz', suffixes: 'ed|ation' },
    { from: 'digitis', to: 'digitiz', suffixes: 'ed|ation|e|es|ing' },
  ],
  words: {
    cheque: 'check',
    cheques: 'checks',
    cypher: 'cipher',
    cyphers: 'ciphers',
    acknowledgement: 'acknowledgment',
    acknowledgements: 'acknowledgments',
    cancelled: 'canceled',
    cancelling: 'canceling',
    fulfil: 'fulfill',
    fulfilment: 'fulfillment',
    enquiry: 'inquiry',
    enquiries: 'inquiries',
    storey: 'story',
    storeys: 'stories',
  },
  phrases: [
    ['Town Name', 'City Name'],
    ['Town Location Name', 'City Location Name'],
    ['Post Code', 'Postal Code'],
    ['Country Sub Division', 'State or Province'],
  ],
};

/** Variants shipped with the library, keyed by locale tag. Add your own with `createDefinitions(..., variants)`. */
export const englishVariants: Record<string, TextVariant> = { 'en-US': enUS };
