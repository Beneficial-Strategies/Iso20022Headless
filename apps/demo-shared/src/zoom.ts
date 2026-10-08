/**
 * Zoom keeps your data. Zooming into an element shows that part on its own, starting with the values it has in the outer
 * message; picking the outer type again brings the outer message back, with whatever you changed while zoomed merged in.
 * Plain values and paths only, so it can be tested without React. Paths look like `Debtor.PostalAddress.AddressLine[1]`.
 */

/** What zooming left behind: the outer editor's values, and where in them the zoomed element sits. */
export interface ZoomFrame {
  message: string;
  /** The type of the editor that was zoomed out of. */
  outerType: string;
  /** Where the zoomed element sits in the outer values. */
  path: string;
  /** The outer editor's values when the zoom began. */
  outer: unknown;
  /** The zoomed element had a value in the outer message (so zooming started from it, not from an empty form). */
  had: boolean;
}

/** The zoomed editor's values now, and what it started with (to tell whether anything was changed). */
export interface EditorValues {
  current: unknown;
  initial: unknown;
}

const parsePath = (path: string): (string | number)[] =>
  path
    .split('.')
    .filter(Boolean)
    .flatMap((part) => {
      const m = /^([^[]*)((?:\[\d+\])*)$/.exec(part);
      if (!m) return [part];
      const indexes = [...m[2]!.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]));
      return [...(m[1] ? [m[1]] : []), ...indexes];
    });

/** The value at a path, or undefined when any step is missing. */
export function valueAt(values: unknown, path: string): unknown {
  let cur: unknown = values;
  for (const step of parsePath(path)) {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[step];
  }
  return cur;
}

/** A copy of `values` with `value` put at the path (missing objects and lists on the way are created). */
export function withValueAt(values: unknown, path: string, value: unknown): unknown {
  const steps = parsePath(path);
  const put = (node: unknown, i: number): unknown => {
    if (i === steps.length) return value;
    const step = steps[i]!;
    const base: Record<string | number, unknown> | unknown[] = Array.isArray(node) ? [...node] : typeof step === 'number' ? [] : { ...((node as object) ?? {}) };
    (base as Record<string | number, unknown>)[step] = put((node as Record<string | number, unknown> | undefined)?.[step], i + 1);
    return base;
  };
  return put(values, 0);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Zoom in: the frame to remember, and the values the zoomed editor starts with (undefined when the element has none yet,
 * so the editor starts empty as it always did).
 */
export function enterZoom(message: string, outerType: string, outer: unknown, path: string): { frame: ZoomFrame; start: unknown } {
  const start = valueAt(outer, path);
  return { frame: { message, outerType, path, outer, had: start !== undefined }, start };
}

/**
 * Pick `target` as the type to edit. If it is a type we zoomed out of, the outer values come back with the zoomed edits written
 * in at the zoomed path (only if something was edited, so zooming into an empty section does not add an empty one), and the
 * frames above it are forgotten. Otherwise undefined: an ordinary type change, which forgets all frames.
 */
export function leaveZoom(stack: ZoomFrame[], target: string, editor: EditorValues | undefined): { values: unknown; stack: ZoomFrame[] } | undefined {
  const at = stack.map((f) => f.outerType).lastIndexOf(target);
  if (at < 0) return undefined;
  const top = stack[stack.length - 1]!;
  // an element that had a value started from it, so its current values go back as they are; one that had none goes back only if edited
  const changed = editor !== undefined && (top.had || !same(editor.current, editor.initial));
  let value: unknown = editor?.current;
  for (let j = stack.length - 1; j >= at; j--) {
    const f = stack[j]!;
    value = changed ? withValueAt(f.outer, f.path, value) : f.outer;
  }
  return { values: value, stack: stack.slice(0, at) };
}
