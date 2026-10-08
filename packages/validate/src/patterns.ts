/**
 * Plain-language description of the regular expressions ISO 20022 uses for text formats, so an error
 * can say what was expected ("4 uppercase letters or digits, then ...") instead of just "Invalid format".
 *
 * Handles the subset ISO patterns use: character classes, `\d`, escaped and literal characters,
 * groups, alternation (`A|B`), and the quantifiers `{n}`, `{n,m}`, `{n,}`, `?`, `+`, `*`. Anything else (alternation,
 * negated classes, ...) is not described: `describePattern` returns undefined and callers fall back.
 */

export type PatternLang = 'en' | 'es' | 'fr' | 'de' | 'pt';

interface CharSet {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  /** Other characters or ranges (`a-f`), as written. */
  other: string[];
}
type Node =
  | { kind: 'set'; set: CharSet; min: number; max: number }
  | { kind: 'lit'; ch: string; min: number; max: number }
  | { kind: 'group'; seq: Node[]; min: number; max: number }
  | { kind: 'alt'; branches: Node[][]; min: number; max: number };

class Unsupported extends Error {}

const emptySet = (): CharSet => ({ upper: false, lower: false, digit: false, other: [] });

/** `/^(?:X)$/`, `^X$` or `X` -> `X`. */
export function normalizePattern(pattern: string): string {
  let p = pattern;
  if (p.startsWith('/') && p.lastIndexOf('/') > 0) p = p.slice(1, p.lastIndexOf('/'));
  if (p.startsWith('^')) p = p.slice(1);
  if (p.endsWith('$') && !p.endsWith('\\$')) p = p.slice(0, -1);
  const wrapped = /^\(\?:(.*)\)$/s.exec(p);
  // only unwrap when the outer group really spans the whole pattern
  if (wrapped && balanced(wrapped[1]!)) p = wrapped[1]!;
  return p;
}

function balanced(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

function parse(src: string): Node[] {
  let i = 0;
  const quantifier = (): [number, number] => {
    const c = src[i];
    if (c === '?') return i++, [0, 1];
    if (c === '+') return i++, [1, Infinity];
    if (c === '*') return i++, [0, Infinity];
    if (c === '{') {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i));
      if (!m) throw new Unsupported();
      i += m[0].length;
      const min = Number(m[1]);
      return [min, m[2] ? (m[3] ? Number(m[3]) : Infinity) : min];
    }
    return [1, 1];
  };
  const escaped = (set: CharSet): string | undefined => {
    const c = src[++i]!;
    i++;
    if (c === 'd') return void (set.digit = true);
    if (/[a-zA-Z0-9]/.test(c)) throw new Unsupported(); // \w, \s, \b ... are not described
    return c;
  };
  const alt = (): Node[] => {
    const branches = [seq()];
    while (src[i] === '|') {
      i++;
      branches.push(seq());
    }
    return branches.length === 1 ? branches[0]! : [{ kind: 'alt', branches, min: 1, max: 1 }];
  };
  const seq = (): Node[] => {
    const out: Node[] = [];
    while (i < src.length && src[i] !== ')' && src[i] !== '|') {
      const c = src[i]!;
      if (c === '.' || c === '^' || c === '$') throw new Unsupported();
      if (c === '(') {
        i++;
        if (src.startsWith('?:', i)) i += 2;
        else if (src[i] === '?') throw new Unsupported();
        const inner = alt();
        if (src[i++] !== ')') throw new Unsupported();
        const [min, max] = quantifier();
        out.push({ kind: 'group', seq: inner, min, max });
      } else if (c === '[') {
        i++;
        if (src[i] === '^') throw new Unsupported();
        const set = emptySet();
        while (i < src.length && src[i] !== ']') {
          let ch = src[i]!;
          if (ch === '\\') {
            const next = src[i + 1]!;
            i += 2;
            if (next === 'd') {
              set.digit = true;
              continue;
            }
            if (/[a-zA-Z0-9]/.test(next)) throw new Unsupported();
            ch = next;
          } else i++;
          if (src[i] === '-' && src[i + 1] !== ']' && i + 1 < src.length) {
            const to = src[i + 1]!;
            i += 2;
            if (ch === 'A' && to === 'Z') set.upper = true;
            else if (ch === 'a' && to === 'z') set.lower = true;
            else if (ch === '0' && to === '9') set.digit = true;
            else set.other.push(`${ch}-${to}`);
          } else set.other.push(ch);
        }
        if (src[i++] !== ']') throw new Unsupported();
        const [min, max] = quantifier();
        out.push({ kind: 'set', set, min, max });
      } else if (c === '\\') {
        const set = emptySet();
        const lit = escaped(set);
        const [min, max] = quantifier();
        out.push(lit === undefined ? { kind: 'set', set, min, max } : { kind: 'lit', ch: lit, min, max });
      } else if ('*+?{}]'.includes(c)) {
        throw new Unsupported();
      } else {
        i++;
        const [min, max] = quantifier();
        out.push({ kind: 'lit', ch: c, min, max });
      }
    }
    return out;
  };
  const nodes = alt();
  if (i < src.length) throw new Unsupported();
  return nodes;
}

interface Words {
  upper: [string, string];
  lower: [string, string];
  letters: [string, string];
  digit: [string, string];
  hex: [string, string];
  or: string;
  alternative: string;
  anyOf: string;
  then: string;
  optionally: string;
  anyNumberOf: string;
  to: string;
  orMore: string;
  character: string;
}

const WORDS: Record<PatternLang, Words> = {
  en: {
    upper: ['uppercase letter', 'uppercase letters'],
    lower: ['lowercase letter', 'lowercase letters'],
    letters: ['letter', 'letters'],
    digit: ['digit', 'digits'],
    hex: ['lowercase hexadecimal digit', 'lowercase hexadecimal digits'],
    or: ' or ',
    alternative: '; or ',
    anyOf: 'any of',
    then: ', then ',
    optionally: 'optionally ',
    anyNumberOf: 'any number of ',
    to: ' to ',
    orMore: ' or more',
    character: 'the character',
  },
  es: {
    upper: ['letra mayúscula', 'letras mayúsculas'],
    lower: ['letra minúscula', 'letras minúsculas'],
    letters: ['letra', 'letras'],
    digit: ['dígito', 'dígitos'],
    hex: ['dígito hexadecimal en minúscula', 'dígitos hexadecimales en minúscula'],
    or: ' o ',
    alternative: '; o ',
    anyOf: 'cualquiera de',
    then: ', luego ',
    optionally: 'opcionalmente ',
    anyNumberOf: 'cualquier cantidad de ',
    to: ' a ',
    orMore: ' o más',
    character: 'el carácter',
  },
  fr: {
    upper: ['lettre majuscule', 'lettres majuscules'],
    lower: ['lettre minuscule', 'lettres minuscules'],
    letters: ['lettre', 'lettres'],
    digit: ['chiffre', 'chiffres'],
    hex: ['chiffre hexadécimal en minuscule', 'chiffres hexadécimaux en minuscules'],
    or: ' ou ',
    alternative: ' ; ou ',
    anyOf: "l'un des",
    then: ', puis ',
    optionally: 'éventuellement ',
    anyNumberOf: 'un nombre quelconque de ',
    to: ' à ',
    orMore: ' ou plus',
    character: 'le caractère',
  },
  de: {
    upper: ['Großbuchstabe', 'Großbuchstaben'],
    lower: ['Kleinbuchstabe', 'Kleinbuchstaben'],
    letters: ['Buchstabe', 'Buchstaben'],
    digit: ['Ziffer', 'Ziffern'],
    hex: ['hexadezimale Ziffer in Kleinbuchstaben', 'hexadezimale Ziffern in Kleinbuchstaben'],
    or: ' oder ',
    alternative: '; oder ',
    anyOf: 'beliebig aus',
    then: ', dann ',
    optionally: 'optional ',
    anyNumberOf: 'beliebig viele ',
    to: ' bis ',
    orMore: ' oder mehr',
    character: 'das Zeichen',
  },
  pt: {
    upper: ['letra maiúscula', 'letras maiúsculas'],
    lower: ['letra minúscula', 'letras minúsculas'],
    letters: ['letra', 'letras'],
    digit: ['dígito', 'dígitos'],
    hex: ['dígito hexadecimal minúsculo', 'dígitos hexadecimais minúsculos'],
    or: ' ou ',
    alternative: '; ou ',
    anyOf: 'qualquer um de',
    then: ', depois ',
    optionally: 'opcionalmente ',
    anyNumberOf: 'qualquer quantidade de ',
    to: ' a ',
    orMore: ' ou mais',
    character: 'o caractere',
  },
};

const noun = (s: CharSet, plural: boolean, w: Words): string => {
  const k = plural ? 1 : 0;
  if (s.digit && !s.upper && !s.lower && s.other.length === 1 && s.other[0] === 'a-f') return w.hex[k];
  const parts: string[] = [];
  if (s.upper && s.lower) parts.push(w.letters[k]);
  else if (s.upper) parts.push(w.upper[k]);
  else if (s.lower) parts.push(w.lower[k]);
  if (s.digit) parts.push(w.digit[k]);
  if (s.other.length) parts.push(`${w.anyOf} ${s.other.join(' ')}`);
  return parts.join(w.or);
};

function describeNodes(nodes: Node[], w: Words): string {
  return nodes
    .map((n) => {
      const optional = n.min === 0 && n.max === 1;
      const body = (plural: boolean): string =>
        n.kind === 'set'
          ? noun(n.set, plural, w)
          : n.kind === 'lit'
            ? `${w.character} "${n.ch}"`
            : n.kind === 'alt'
              ? n.branches.map((b) => describeNodes(b, w)).join(w.alternative)
              : describeNodes(n.seq, w);
      if (optional) return `${w.optionally}${body(false)}`;
      if (n.kind === 'group' || n.kind === 'alt') return body(false); // a repeated group: describe once; counts below would misread it
      if (n.kind === 'lit') return n.min === 1 && n.max === 1 ? body(false) : `${n.min === n.max ? n.min : `${n.min}${w.to}${n.max}`} × "${n.ch}"`;
      const count =
        n.min === n.max ? `${n.min}` : n.max === Infinity ? (n.min === 0 ? w.anyNumberOf.trim() : `${n.min}${w.orMore}`) : `${n.min}${w.to}${n.max}`;
      return n.min === 0 && n.max === Infinity ? `${w.anyNumberOf}${body(true)}` : `${count} ${body(n.max !== 1 || n.min !== 1)}`;
    })
    .join(w.then);
}

const longest = (nodes: Node[]): number =>
  nodes.reduce((sum, n) => {
    const inner = n.kind === 'set' || n.kind === 'lit' ? 1 : n.kind === 'group' ? longest(n.seq) : Math.max(...n.branches.map(longest));
    return sum + inner * n.max;
  }, 0);

/**
 * The most characters a value matching the pattern can have, or undefined when there is no limit or the pattern uses
 * something this does not read. A BIC is 11, a country code 2, an IBAN 34. Used to size an input to what it can hold.
 */
export function patternMaxLength(pattern: string): number | undefined {
  try {
    const n = longest(parse(normalizePattern(pattern)));
    return Number.isFinite(n) ? n : undefined;
  } catch (e) {
    if (e instanceof Unsupported) return undefined;
    throw e;
  }
}

/** What a pattern accepts, in words; undefined when the pattern uses features this does not describe. */
export function describePattern(pattern: string, lang: PatternLang = 'en'): string | undefined {
  try {
    return describeNodes(parse(normalizePattern(pattern)), WORDS[lang]);
  } catch (e) {
    if (e instanceof Unsupported) return undefined;
    throw e;
  }
}

interface Known {
  name: Record<PatternLang, string>;
  example: string;
}

/** Widely used identifiers whose ISO 20022 pattern is unambiguous: name them and give an example. */
const KNOWN: Record<string, Known> = {
  '[A-Z0-9]{4,4}[A-Z]{2,2}[A-Z0-9]{2,2}([A-Z0-9]{3,3}){0,1}': {
    name: { en: 'BIC (8 or 11 characters)', es: 'BIC (8 u 11 caracteres)', fr: 'BIC (8 ou 11 caractères)', de: 'BIC (8 oder 11 Zeichen)', pt: 'BIC (8 ou 11 caracteres)' },
    example: 'DEUTDEFF / DEUTDEFF500',
  },
  '[A-Z0-9]{18,18}[0-9]{2,2}': { name: { en: 'LEI (20 characters)', es: 'LEI (20 caracteres)', fr: 'LEI (20 caractères)', de: 'LEI (20 Zeichen)', pt: 'LEI (20 caracteres)' }, example: '529900T8BM49AURSDO55' },
  '[A-Z]{2,2}[0-9]{2,2}[a-zA-Z0-9]{1,30}': { name: { en: 'IBAN', es: 'IBAN', fr: 'IBAN', de: 'IBAN', pt: 'IBAN' }, example: 'DE89370400440532013000' },
  '[A-Z]{2,2}': { name: { en: 'country code (ISO 3166-1 alpha-2)', es: 'código de país (ISO 3166-1 alfa-2)', fr: 'code pays (ISO 3166-1 alpha-2)', de: 'Ländercode (ISO 3166-1 Alpha-2)', pt: 'código de país (ISO 3166-1 alfa-2)' }, example: 'DE' },
  '[A-Z]{3,3}': { name: { en: 'currency code (ISO 4217)', es: 'código de moneda (ISO 4217)', fr: 'code de devise (ISO 4217)', de: 'Währungscode (ISO 4217)', pt: 'código de moeda (ISO 4217)' }, example: 'EUR' },
};

/** Words for the example label, per language. */
const LABELS: Record<PatternLang, { invalid: string; notValid: string; expected: string; example: string }> = {
  en: { invalid: 'Invalid format', notValid: 'Not a valid', expected: 'Expected', example: 'Example' },
  es: { invalid: 'Formato no válido', notValid: 'No es un', expected: 'Se espera', example: 'Ejemplo' },
  fr: { invalid: 'Format non valide', notValid: 'Non conforme au format', expected: 'Attendu', example: 'Exemple' },
  de: { invalid: 'Ungültiges Format', notValid: 'Kein gültiger Wert für', expected: 'Erwartet', example: 'Beispiel' },
  pt: { invalid: 'Formato inválido', notValid: 'Não é um valor válido de', expected: 'Esperado', example: 'Exemplo' },
};

/**
 * Message for a text value that does not match `pattern`. Undefined when nothing useful can be said
 * (the pattern is not describable), so the caller can use its generic text.
 */
export function formatHint(pattern: string | undefined, lang: PatternLang = 'en'): string | undefined {
  if (!pattern) return undefined;
  const norm = normalizePattern(pattern);
  const desc = describePattern(norm, lang);
  if (!desc) return undefined;
  const l = LABELS[lang];
  const known = KNOWN[norm];
  if (known) return `${l.notValid} ${known.name[lang]}. ${l.expected}: ${desc}. ${l.example}: ${known.example}`;
  return `${l.invalid}. ${l.expected}: ${desc}.`;
}
