import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { INFO_BUTTON_CLASS, Popup, useHoverTip, useSkin, type FieldExtraContext, type FieldMode } from '@beneficial-strategies/iso20022-react-ui';
import { useDemoText, type DemoKey } from './demoText.ts';

/**
 * The demos' "field mode" switch, imposed on the form from outside through `fieldExtra`: beside the "i" of every element, a
 * small button shows how the element is presented (editable, a label, or hidden) and opens a menu to change it. The form
 * library does the presenting (`fieldMode`); this is only the control for choosing, and it belongs to the demo.
 */
const MODES: { mode: FieldMode; label: DemoKey; description: DemoKey }[] = [
  { mode: 'editable', label: 'modeEditable', description: 'modeEditableDesc' },
  { mode: 'label', label: 'modeLabel', description: 'modeLabelDesc' },
  { mode: 'hidden', label: 'modeHidden', description: 'modeHiddenDesc' },
];

/** A small drawing of each mode: a pencil (editable), lines of text (a label), an eye with a slash (hidden). */
function Glyph({ mode }: { mode: FieldMode }) {
  const common = { width: 10, height: 10, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (mode === 'editable')
    return (
      <svg {...common}>
        <path d="M2 10 L2.7 7.4 L8.2 1.9 L10.1 3.8 L4.6 9.3 Z" />
      </svg>
    );
  if (mode === 'label')
    return (
      <svg {...common}>
        <path d="M2 4 H10 M2 8 H7" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M1 6 C2.6 3.2 4.2 2.6 6 2.6 S9.4 3.2 11 6 C9.4 8.8 7.8 9.4 6 9.4 S2.6 8.8 1 6 Z" />
      <path d="M2 10.5 L10 1.5" />
    </svg>
  );
}

const COLOUR: Record<FieldMode, string> = { editable: 'text-muted', label: 'text-accent', hidden: 'text-warn-fg' };

export function FieldModeSwitch({ element, mode, onChange }: { element: FieldExtraContext; mode: FieldMode; onChange: (mode: FieldMode) => void }) {
  const t = useDemoText();
  const skin = useSkin();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const tipId = useId();
  const tip = useHoverTip(button, open); // the explanation on hover; not while the menu itself is open
  const current = MODES.find((m) => m.mode === mode)!;
  const title = t('fieldModeTitle', { mode: t(current.label), element: element.label });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // the popup is placed a moment after it appears, and a hidden element cannot take focus: wait until it is shown
    const focus = setInterval(() => {
      const checked = popup.current?.querySelector<HTMLElement>('[aria-checked=true]');
      checked?.focus();
      if (checked && document.activeElement === checked) clearInterval(focus);
    }, 20);
    const giveUp = setTimeout(() => clearInterval(focus), 600);
    return () => {
      document.removeEventListener('mousedown', onDown);
      clearInterval(focus);
      clearTimeout(giveUp);
    };
  }, [open]);

  const choose = (m: FieldMode): void => {
    onChange(m);
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
      return;
    }
    const items = [...(popup.current?.querySelectorAll<HTMLElement>('[role=menuitemradio]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
  };

  // the plain skin promises ordinary HTML and no classes: an ordinary select-like button
  if (skin.id === 'plain') {
    return (
      <select aria-label={t('fieldModeTitle', { mode: t(current.label), element: element.label })} title={title} value={mode} data-field-mode-switch onChange={(e) => onChange(e.target.value as FieldMode)}>
        {MODES.map((m) => (
          <option key={m.mode} value={m.mode}>
            {t(m.label)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={tip.show ? tipId : undefined}
        aria-label={title}
        data-field-mode-switch={mode}
        className={`${INFO_BUTTON_CLASS.replace('text-muted', '')} ${COLOUR[mode]}`}
        {...tip.handlers}
        onClick={() => {
          tip.hide();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') tip.hide();
        }}
      >
        <Glyph mode={mode} />
      </button>
      {tip.show ? (
        <Popup anchor={button.current} role="tooltip" id={tipId} width={300} className="space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg">
          <span className="block font-semibold">{t('fieldModeTipTitle', { mode: t(current.label) })}</span>
          <span className="block">{t('fieldModeTip')}</span>
        </Popup>
      ) : null}
      {open ? (
        <Popup ref={popup} anchor={button.current} id={menuId} role="menu" label={t('fieldModeMenu')} width={280} className="rounded border border-edge bg-surface p-1 text-sm text-fg shadow-lg">
          <div onKeyDown={onKeyDown}>
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                role="menuitemradio"
                aria-checked={m.mode === mode}
                data-mode={m.mode}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent-soft focus:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => choose(m.mode)}
              >
                <span className={`mt-0.5 ${COLOUR[m.mode]}`}>
                  <Glyph mode={m.mode} />
                </span>
                <span>
                  <span className="block font-medium">
                    {t(m.label)}
                    {m.mode === mode ? ' ✓' : ''}
                  </span>
                  <span className="block text-xs text-muted">{t(m.description)}</span>
                </span>
              </button>
            ))}
          </div>
        </Popup>
      ) : null}
    </span>
  );
}
