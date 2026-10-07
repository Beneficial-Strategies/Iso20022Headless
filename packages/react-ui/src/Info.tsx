import { useEffect, useId, useRef, useState } from 'react';
import type { Localized } from '@beneficial-strategies/iso20022-validate/definitions';
import { Popup } from './Popup.tsx';
import { useI18n } from './i18n/context.tsx';

/** The MCP uses `||` for paragraph breaks and `|` for line breaks. Render both as paragraphs. */
export function paragraphs(text: string): string[] {
  return text.split('|').map((s) => s.trim()).filter(Boolean);
}

/** The definition text, plus the notes saying it is English or a machine translation. Shared by the popup and the inline note. */
function HelpText({ def, muted }: { def: Localized; muted?: string }) {
  const { t, lang } = useI18n();
  return (
    <>
      {paragraphs(def.text).map((p, i) => (
        <span key={i} className="block">
          {p}
        </span>
      ))}
      {def.lang !== lang ? <span className={`block ${muted ?? 'text-muted'}`} lang={def.lang}>{t('englishNote')}</span> : null}
      {def.lang === lang && def.status === 'machine' ? <span className={`block ${muted ?? 'text-muted'}`}>{t('machineNote')}</span> : null}
    </>
  );
}

/**
 * Help for an element: an "i" button. Hovering it (or focusing it with the keyboard) shows the definition in a
 * popup; clicking it (or Enter/Space) shows the same text inline under the label, until it is clicked again or
 * Escape is pressed. While the inline text is shown, no popup is needed. When the text is in a different language
 * than the page (spec text with no translation), it says so.
 */
export function Info({ def, label, open, onToggle, noteId }: { def: Localized | undefined; label: string; open: boolean; onToggle: () => void; noteId: string }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const { t } = useI18n();
  const tip = (hover || focused) && !open;

  // a popup left behind by a page scroll or a touch screen (no mouseleave) goes away on the next outside press
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: MouseEvent) => {
      if (!trigger.current?.contains(e.target as Node)) {
        setHover(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tip]);

  if (!def) return null;
  return (
    <span
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        setHover(false);
        setFocused(false);
        if (open) onToggle();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t('aboutLabel', { label })}
        aria-expanded={open}
        aria-controls={open ? noteId : undefined}
        aria-describedby={tip ? tipId : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge text-[10px] font-semibold leading-none text-muted hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        // only keyboard focus opens the popup: after a mouse click the button stays focused, which must not pin it
        onFocus={(e) => {
          try {
            setFocused(e.currentTarget.matches(':focus-visible'));
          } catch {
            setFocused(false);
          }
        }}
        onBlur={() => setFocused(false)}
        onClick={onToggle}
      >
        i
      </button>
      {tip ? (
        <Popup
          anchor={trigger.current}
          role="tooltip"
          id={tipId}
          width={288}
          className="space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg"
        >
          <HelpText def={def} />
          <span className="block border-t border-line pt-1 text-muted">{t('helpClickHint')}</span>
        </Popup>
      ) : null}
    </span>
  );
}

/** The inline help shown under a label while its "i" button is toggled on: small text, like the "(optional)" mark. */
export function InfoNote({ def, id }: { def: Localized | undefined; id: string }) {
  if (!def) return null;
  return (
    <div id={id} role="note" className="mb-1 space-y-1 text-xs font-normal text-muted">
      <HelpText def={def} />
    </div>
  );
}
