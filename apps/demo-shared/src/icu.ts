/**
 * The small subset of ICU MessageFormat the text hosts use: `{name}` and `{name, plural, =1 {one} other {many #}}`, where `#` is the number.
 * Everything else in a text is kept as written. A text without braces is returned as it is.
 */
export type IcuParams = Record<string, string | number | undefined>;

/** Index of the `}` that closes the `{` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export function formatIcu(text: string, params: IcuParams = {}, hash?: number): string {
  if (!text.includes('{') && hash === undefined) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '#' && hash !== undefined) out += String(hash);
    else if (c !== '{') out += c;
    else {
      const end = closing(text, i);
      if (end < 0) { out += text.slice(i); break; }
      const body = text.slice(i + 1, end);
      const comma = body.indexOf(',');
      const name = (comma < 0 ? body : body.slice(0, comma)).trim();
      if (comma < 0) out += /^\w+$/.test(name) && params[name] !== undefined ? String(params[name]) : text.slice(i, end + 1);
      else out += plural(name, body.slice(comma + 1), params, text.slice(i, end + 1));
      i = end;
    }
  }
  return out;
}

function plural(name: string, rest: string, params: IcuParams, whole: string): string {
  const m = /^\s*plural\s*,/.exec(rest);
  const value = params[name];
  if (!m || value === undefined) return whole;
  const n = Number(value);
  const options = new Map<string, string>();
  const body = rest.slice(m[0].length);
  for (let i = 0; i < body.length; ) {
    const open = body.indexOf('{', i);
    if (open < 0) break;
    const end = closing(body, open);
    if (end < 0) break;
    options.set(body.slice(i, open).trim(), body.slice(open + 1, end));
    i = end + 1;
  }
  const chosen = options.get(`=${n}`) ?? options.get('other');
  return chosen === undefined ? whole : formatIcu(chosen, params, n);
}
