import { useId, useRef } from 'react';
import { INFO_BUTTON_CLASS, Popup, useHoverTip, useSkin, type FieldExtraContext } from '@beneficial-strategies/iso20022-react-ui';
import { useDemoText } from './demoText.ts';

/**
 * The demos' own "zoom" button, imposed on the form from outside: the form library has no idea what zooming is. It is given
 * to `SchemaForm` as `fieldExtra`, so it appears right after the "i" of every element that is a component type; clicking it
 * calls `onZoom` with the type's name and where the element sits (the demos then show that type on its own, starting with the
 * element's values, as picking it in the type list does otherwise; see zoom.ts).
 * Its wording is the demo's too: the English is in demoText.ts and any other language comes from a text host.
 */
export function ZoomButton({ type, onZoom }: { type: string; onZoom: () => void }) {
  const skin = useSkin();
  const t = useDemoText();
  // the plain skin promises ordinary HTML and no classes: it gets an ordinary button, as its own "i" is an ordinary <details>
  if (skin.id === 'plain') {
    return (
      <button type="button" aria-label={t('zoomLabel', { type })} title={t('zoomTip', { type })} onClick={onZoom}>
        {t('zoomShort')}
      </button>
    );
  }
  const trigger = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const tip = useHoverTip(trigger);
  return (
    <span
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === 'Escape') tip.hide();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t('zoomLabel', { type })}
        aria-describedby={tip.show ? tipId : undefined}
        className={INFO_BUTTON_CLASS}
        {...tip.handlers}
        onClick={() => {
          tip.hide();
          onZoom();
        }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="5" cy="5" r="3.4" />
          <path d="M7.6 7.6 L10.8 10.8" />
          <path d="M3.7 5 H6.3 M5 3.7 V6.3" strokeWidth="1" />
        </svg>
      </button>
      {tip.show ? (
        <Popup
          anchor={trigger.current}
          role="tooltip"
          id={tipId}
          width={320}
          className="space-y-1 rounded border border-edge bg-surface p-2 text-left text-xs font-normal text-fg shadow-lg"
        >
          {t('zoomTip', { type })}
        </Popup>
      ) : null}
    </span>
  );
}

/** The `fieldExtra` of the demos: a zoom button on every element that is a component type (not on values, choices, or the form title). */
export const zoomExtra =
  (onZoom: (type: string, path: string) => void) =>
  (element: FieldExtraContext) =>
    element.kind === 'component' ? <ZoomButton type={element.type} onZoom={() => onZoom(element.type, element.path)} /> : null;
