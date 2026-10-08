import { useId, useRef } from 'react';
import { INFO_BUTTON_CLASS, Popup, useHoverTip, useI18n, useSkin, type FieldExtraContext } from '@beneficial-strategies/iso20022-react-ui';

/**
 * The demos' own "zoom" button, imposed on the form from outside: the form library has no idea what zooming is. It is given
 * to `SchemaForm` as `fieldExtra`, so it appears right after the "i" of every element that is a component type; clicking it
 * calls `onZoom` with the type's name and where the element sits (the demos then show that type on its own, starting with the
 * element's values, as picking it in the type list does otherwise; see zoom.ts).
 * Its wording is the demo's too, in the languages the demos ship.
 */
const TEXT: Record<string, { label: string; short: string; tip: string }> = {
  en: {
    label: 'Zoom in to {type}',
    short: 'Zoom',
    tip: 'This message subset is based upon the ISO 20022 type {type}. If you are adding or editing lookup values that may be persisted somewhere, you might need a control based on this subset of message data. Click Zoom to zoom in to that data type in isolation from the outer message.',
  },
  es: {
    label: 'Hacer zoom en {type}',
    short: 'Zoom',
    tip: 'Este subconjunto del mensaje se basa en el tipo ISO 20022 {type}. Si está agregando o editando valores de consulta que quizá se guarden en algún lugar, puede necesitar un control basado en este subconjunto de datos del mensaje. Haga clic en Zoom para acercarse a ese tipo de datos, aislado del mensaje que lo contiene.',
  },
};

const fill = (text: string, type: string): string => text.replace('{type}', type);

export function ZoomButton({ type, onZoom }: { type: string; onZoom: () => void }) {
  const { lang } = useI18n();
  const skin = useSkin();
  const text = TEXT[lang] ?? TEXT.en!;
  // the plain skin promises ordinary HTML and no classes: it gets an ordinary button, as its own "i" is an ordinary <details>
  if (skin.id === 'plain') {
    return (
      <button type="button" aria-label={fill(text.label, type)} title={fill(text.tip, type)} onClick={onZoom}>
        {text.short}
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
        aria-label={fill(text.label, type)}
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
          {fill(text.tip, type)}
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
