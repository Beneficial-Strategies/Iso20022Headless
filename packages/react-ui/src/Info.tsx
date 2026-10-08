import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from 'react';
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
 * Hover (or keyboard focus) state of a button that shows a popup. A mouse click leaves focus on the button, which must not pin
 * the popup. Exported so that buttons a host adds beside the "i" (see `SchemaForm`'s `fieldExtra`) can behave the same.
 */
export function useHoverTip(trigger: RefObject<HTMLElement | null>, suppress = false) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const show = (hover || focused) && !suppress;

  // a popup left behind by a page scroll or a touch screen (no mouseleave) goes away on the next outside press
  useEffect(() => {
    if (!show) return;
    const onDown = (e: MouseEvent) => {
      if (!trigger.current?.contains(e.target as Node)) {
        setHover(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [show, trigger]);

  return {
    show,
    hide: () => {
      setHover(false);
      setFocused(false);
    },
    handlers: {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      // only keyboard focus opens the popup
      onFocus: (e: FocusEvent<HTMLElement>) => {
        try {
          setFocused(e.currentTarget.matches(':focus-visible'));
        } catch {
          setFocused(false);
        }
      },
      onBlur: () => setFocused(false),
    },
  };
}

/** ISO's public page for a type (a message, a component, a code set or a value type), which opens in a new window from the spec button. */
export const isoTypeUrl = (type: string): string => `https://www.iso20022.org/standardsrepository/type/${encodeURIComponent(type)}`;

/** The look of the round "i" button, for buttons a host adds beside it. */
export const INFO_BUTTON_CLASS =
  'inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge text-[10px] font-semibold leading-none text-muted hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * The small button after the "i" that opens ISO's official page for the element's type in a new window; hovering says which
 * type. It is a real link, so it can also be opened in a new tab, copied and middle-clicked.
 */
function SpecButton({ spec }: { spec: { type: string; url: string } }) {
  const trigger = useRef<HTMLAnchorElement>(null);
  const tipId = useId();
  const { t } = useI18n();
  const tip = useHoverTip(trigger);
  const text = t('specTip', { type: spec.type });
  return (
    <span
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === 'Escape') tip.hide();
      }}
    >
      <a
        ref={trigger}
        href={spec.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text}
        aria-describedby={tip.show ? tipId : undefined}
        data-spec-link={spec.type}
        className={INFO_BUTTON_CLASS}
        {...tip.handlers}
        onClick={() => tip.hide()}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 1.5 H7 L9.5 4 V10.5 H3 Z" />
          <path d="M7 1.5 V4 H9.5" />
        </svg>
      </a>
      {tip.show ? (
        <Popup anchor={trigger.current} role="tooltip" id={tipId} width={260} className="space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg">
          {text}
        </Popup>
      ) : null}
    </span>
  );
}

/**
 * Help for an element: an "i" button. Hovering it (or focusing it with the keyboard) shows the definition in a
 * popup that ends with a hint to click; clicking it (or Enter/Space) shows the same text inline under the label,
 * until it is clicked again or Escape is pressed. While the inline text is shown, no popup is needed. When the text
 * is in a different language than the page (spec text with no translation), it says so.
 * `extra` is whatever the host wants beside the "i" (see `SchemaForm`'s `fieldExtra`); the library puts nothing there itself.
 */
export function Info({
  def,
  label,
  open,
  onToggle,
  noteId,
  extra,
  spec,
}: {
  def: Localized | undefined;
  label: string;
  open: boolean;
  onToggle: () => void;
  noteId: string;
  extra?: ReactNode;
  /** The element's type and the address of its official page: a small button after the "i" opens it. */
  spec?: { type: string; url: string } | undefined;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const { t } = useI18n();
  const tip = useHoverTip(trigger, open);

  if (!def && !extra && !spec) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {def ? (
        <span
          className="relative inline-flex"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            tip.hide();
            if (open) onToggle();
          }}
        >
          <button
            ref={trigger}
            type="button"
            aria-label={t('aboutLabel', { label })}
            aria-expanded={open}
            aria-controls={open ? noteId : undefined}
            aria-describedby={tip.show ? tipId : undefined}
            className={INFO_BUTTON_CLASS}
            {...tip.handlers}
            onClick={onToggle}
          >
            i
          </button>
          {tip.show ? (
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
      ) : null}
      {spec ? <SpecButton spec={spec} /> : null}
      {extra}
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
