import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from './i18n/context.tsx';
import type { DescribedOption } from './skin/types.ts';

export type { DescribedOption };

interface Props {
  id: string;
  value: string;
  options: DescribedOption[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
  describedBy?: string | undefined;
  className?: string;
}

/** The MCP uses `|` for line breaks; show them as spaces inside a one-line description. */
const oneLine = (s: string): string => s.split('|').map((x) => x.trim()).filter(Boolean).join(' ');

/**
 * Accessible select-only combobox (WAI-ARIA APG pattern) whose open list shows each option's
 * description. A native <select> cannot render anything but plain text in its options.
 * Keyboard: Arrow Up/Down, Home/End, Enter/Space to choose, Escape to close, type to jump.
 */
export function DescribedSelect({ id, value, options, onChange, onBlur, placeholder: placeholderProp, invalid, required, describedBy, className }: Props) {
  const { t } = useI18n();
  const placeholder = placeholderProp ?? t('select');
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  // The empty "none" entry is always first so a value can be cleared.
  const all = useMemo<DescribedOption[]>(() => [{ value: '', label: placeholder }, ...options], [options, placeholder]);
  const selectedIndex = Math.max(0, all.findIndex((o) => o.value === value));
  const [active, setActive] = useState(selectedIndex);
  const selected = all[selectedIndex]!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (i: number) => {
    onChange(all[i]!.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = all.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.min(a + 1, last));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.max(a - 1, 0));
        return;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        return;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(last);
        }
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) choose(active);
        else openList();
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case 'Tab':
        if (open) choose(active); // APG: Tab selects the active option and moves on
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const from = t.text.length === 1 ? active + 1 : active;
          const order = [...all.keys()].map((k) => (k + from) % all.length);
          const hit = order.find((k) => all[k]!.label.toLowerCase().startsWith(t.text) || all[k]!.value.toLowerCase().startsWith(t.text));
          if (hit !== undefined) {
            if (!open) setOpen(true);
            setActive(hit);
          }
        }
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        className={
          className ??
          'flex w-full items-center justify-between rounded border border-edge bg-surface px-2 py-1 text-left text-sm text-fg shadow-sm focus:border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-[invalid=true]:border-danger-line aria-[invalid=true]:bg-danger-soft'
        }
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onBlur={() => onBlur?.()}
      >
        <span className={selected.value === '' ? 'text-muted' : ''}>{selected.label}</span>
        <span aria-hidden="true" className="ml-2 text-xs text-muted">▾</span>
      </button>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={t('options')}
          className="absolute z-30 mt-1 max-h-72 w-[min(34rem,90vw)] overflow-auto rounded border border-edge bg-surface py-1 text-fg shadow-lg"
        >
          {all.map((o, i) => (
            <li
              key={o.value || '__none'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? 'bg-accent-soft' : ''} ${i === selectedIndex ? 'font-semibold' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault() /* keep focus on the combobox */}
              onClick={() => choose(i)}
            >
              <div className={o.value === '' ? 'text-muted' : ''}>{o.label}</div>
              {o.description ? <div className="mt-0.5 text-xs font-normal text-muted">{oneLine(o.description)}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
