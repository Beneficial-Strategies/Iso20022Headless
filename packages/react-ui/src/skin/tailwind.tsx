import type { CSSProperties } from 'react';
import { DescribedSelect } from '../DescribedSelect.tsx';
import { useI18n } from '../i18n/context.tsx';
import { Info, InfoNote } from '../Info.tsx';
import type { Skin } from './types.ts';

const control =
  'w-full rounded border border-edge bg-surface text-fg px-2 py-1 text-sm shadow-sm focus:border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-[invalid=true]:border-danger-line aria-[invalid=true]:bg-danger-soft';

/** The width of a control that needs about `chars` characters: a little more than that (capital letters are wider than digits, so that nothing is cut off) and room for the box itself. Never more than the panel. */
const fit = (chars?: number): CSSProperties | undefined => (chars ? { maxWidth: `calc(${Math.ceil(chars * 1.4)}ch + 2rem)` } : undefined);

const btn = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-fg text-surface hover:opacity-80',
  danger: 'bg-surface text-danger ring-1 ring-danger-line hover:bg-danger-soft',
};

/** The demo's own look: Tailwind utilities over semantic tokens (light/dark/size/density aware). */
export const tailwindSkin: Skin = {
  id: 'tailwind',
  label: 'Tailwind',
  description: 'Utility-class styling with a custom accessible dropdown and help popovers.', // shown via the skin_tailwind* UI messages
  Stack: ({ children }) => <div className="space-y-3">{children}</div>,
  Title: ({ children, info, note }) => (
    <div className="mb-3">
      <h2 className="text-2xl font-bold text-fg">
        {children}
        {info ? <span className="ml-2 align-middle text-base font-normal">{info}</span> : null}
      </h2>
      {note}
    </div>
  ),
  Group: function Group({ title, required, info, note, error, children }) {
    const { t } = useI18n();
    return (
      <fieldset className="rounded border border-line bg-surface-alt p-3">
        <legend className="px-1 text-sm font-semibold text-fg">
          {title}
          {required ? <span className="ml-1 text-xs font-normal text-muted">{t('required')}</span> : null}
          {info ? <span className="ml-1 align-middle">{info}</span> : null}
        </legend>
        {note}
        <div className="space-y-3">{children}</div>
        {error}
      </fieldset>
    );
  },
  ChoiceBox: ({ children }) => <div className="rounded border border-dashed border-edge p-2">{children}</div>,
  Field: function Field({ id, label, required, info, note, error, children }) {
    const { t } = useI18n();
    return (
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <label htmlFor={id} className="block text-xs font-medium text-fg">
            {label}
            {required ? (
              <>
                <span aria-hidden="true" className="text-danger"> *</span>
                <span className="ml-1 font-normal text-muted">{t('required')}</span>
              </>
            ) : null}
          </label>
          {info}
        </div>
        {note}
        {children}
        {error}
      </div>
    );
  },
  Row: ({ children, weights, chars }) => (
    // the font size is set so that `ch` means the same here as in the inputs inside: the cap is in their characters
    <div className="flex gap-2" style={chars ? { ...fit(chars), fontSize: '0.875rem' } : undefined}>
      {(Array.isArray(children) ? children : [children]).map((c, i) => (
        <div key={i} className={weights?.[i] === 'fixed' ? 'w-24' : weights?.[i] === 'auto' ? 'shrink-0' : 'flex-1'}>
          {c}
        </div>
      ))}
    </div>
  ),
  Text: ({ field, type = 'text', maxLength, placeholder, inputMode, ariaLabel, multiline, mono, chars }) =>
    multiline ? (
      <textarea {...field} rows={2} placeholder={placeholder} aria-label={ariaLabel} className={`${control} ${mono ? 'font-mono' : ''}`} />
    ) : (
      <input {...field} type={type} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} aria-label={ariaLabel} className={control} style={fit(chars)} />
    ),
  Select: ({ id, value, options, onChange, onBlur, invalid, required, describedBy, chars }) => (
    <DescribedSelect id={id} value={value} options={options} onChange={onChange} onBlur={onBlur} invalid={invalid} required={required} describedBy={describedBy} {...(chars ? { style: fit(chars) } : {})} />
  ),
  Button: ({ children, onClick, variant = 'primary', disabled, ariaLabel }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40 ${btn[variant]}`}
    >
      {children}
    </button>
  ),
  Hint: ({ id, children }) => (
    <p id={id} className="mt-0.5 text-xs text-muted">
      {children}
    </p>
  ),
  Error: ({ id, children }) => (
    <p id={id} role="alert" className="mt-0.5 text-xs text-danger">
      {children}
    </p>
  ),
  Toggle: function Toggle({ id, checked, onChange, label, info, note }) {
    const { t } = useI18n();
    // word order differs between languages: split the translated sentence around the label
    const [before = '', after = ''] = t('include', { label: '\u0001' }).split('\u0001');
    return (
      <div>
        <div className="flex items-center gap-2">
          <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id} className="text-sm text-fg">
            {before}
            <span className="font-medium">{label}</span>
            {after} <span className="text-xs text-muted">{t('optional')}</span>
          </label>
          {info}
        </div>
        {note ? <div className="ml-6">{note}</div> : null}
      </div>
    );
  },
  ListHeader: ({ title, info, note, caption, action }) => (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">
          {title}
          <span className="ml-1 align-middle">{info}</span>
          <span className="ml-1 text-xs font-normal text-muted">({caption})</span>
        </span>
        {action}
      </div>
      {note}
    </div>
  ),
  ListItem: function ListItem({ removeLabel, onRemove, children }) {
    const { t } = useI18n();
    return (
      <div>
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            aria-label={removeLabel}
            className="rounded bg-surface px-1.5 py-0.5 text-xs text-danger ring-1 ring-danger-line hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onRemove}
          >
            {t('remove')}
          </button>
        </div>
        {children}
      </div>
    );
  },
  Info: (p) => <Info {...p} />,
  InfoNote: (p) => <InfoNote {...p} />,
  Value: ({ id, children }) => (
    <p id={id} className="text-sm text-fg">
      {children}
    </p>
  ),
  // hidden: hatched and dashed, as if switched off; label: a faint tint of the accent. The attribute lets a host or a test find them.
  ModeMark: ({ mode, children }) => (
    <div
      data-field-mode={mode}
      className={`rounded px-1 py-0.5 outline-1 outline-dashed ${mode === 'hidden' ? 'bg-[repeating-linear-gradient(135deg,transparent_0,transparent_7px,var(--color-edge)_7px,var(--color-edge)_8px)] opacity-80 outline-edge' : 'bg-accent-soft/60 outline-accent'}`}
    >
      {children}
    </div>
  ),
};
