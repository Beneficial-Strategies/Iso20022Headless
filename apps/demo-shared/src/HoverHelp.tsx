import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Popup } from '@beneficial-strategies/iso20022-react-ui';

/**
 * Hover help for a control that is not ours to change (a dropdown from the library, a button): wraps it and shows a small popup
 * while the pointer is over it or a keyboard user has focused it. It steps aside as soon as the control is pressed, so it never
 * sits over the control's own list, and comes back the next time the pointer enters. The text is the demo's own.
 */
export function HoverHelp({ title, text, className = '', children }: { title: string; text: string; className?: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const show = (hover || focused) && !pressed;
  const inside = (target: EventTarget): boolean => box.current?.contains(target as Node) ?? false;

  // an open list of the control (a dropdown) is not ours to know about: pressing anywhere inside hides the help until the pointer leaves
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHover(false);
        setFocused(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <div
      ref={box}
      className={className}
      // a control may open a dialog or list that is rendered elsewhere in the page but still belongs to it in React's tree: its
      // events reach this box too, and are not ours (no help over the dialog)
      onMouseEnter={(e) => inside(e.target) && setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onFocus={(e) => {
        if (!inside(e.target)) return;
        try {
          setFocused((e.target as HTMLElement).matches(':focus-visible'));
        } catch {
          setFocused(false);
        }
      }}
      onBlur={() => {
        setFocused(false);
        setPressed(false);
      }}
      aria-describedby={show ? tipId : undefined}
    >
      {children}
      {show ? (
        <Popup anchor={box.current} role="tooltip" id={tipId} width={300} className="space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg">
          <span className="block font-semibold">{title}</span>
          <span className="block">{text}</span>
        </Popup>
      ) : null}
    </div>
  );
}
