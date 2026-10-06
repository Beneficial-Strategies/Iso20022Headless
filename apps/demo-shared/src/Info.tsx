import { useEffect, useId, useRef, useState } from 'react';
import type { FieldDescriptor } from '@beneficial-strategies/iso20022-validate';
import { fieldDefinitions, typeDefinitions } from '@beneficial-strategies/iso20022-validate/definitions';

/** Definition for a field: its own spec text, else the text of its type. */
export function definitionFor(parentType: string | undefined, field: FieldDescriptor): string | undefined {
  return (parentType ? fieldDefinitions[`${parentType}.${field.name}`] : undefined) || typeDefinitions[field.type] || undefined;
}

/** The MCP uses `||` for paragraph breaks and `|` for line breaks. Render both as paragraphs. */
function paragraphs(text: string): string[] {
  return text.split('|').map((s) => s.trim()).filter(Boolean);
}

/**
 * Keyboard- and touch-accessible help: an "i" button toggles a note (Escape or an outside click closes it).
 * A hover-only tooltip would be invisible to both.
 */
export function Info({ text, label }: { text: string | undefined; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!text) return null;
  return (
    <span
      ref={root}
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge text-[10px] font-semibold leading-none text-muted hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute left-5 top-0 z-30 block w-72 max-w-[80vw] space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg"
        >
          {paragraphs(text).map((p, i) => (
            <span key={i} className="block">
              {p}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
