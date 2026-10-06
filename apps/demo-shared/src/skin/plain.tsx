import type { Skin } from './types.ts';

/** Spec definitions use `|` for line breaks; render them as separate paragraphs. */
const paras = (text: string): string[] => text.split('|').map((s) => s.trim()).filter(Boolean);

/**
 * No classes and no CSS of its own: bare semantic HTML (fieldset, legend, label, input, native
 * select, details). The browser's default styles and the page's color-scheme do all the work.
 * Same form logic, same ARIA values, completely different markup.
 */
export const plainSkin: Skin = {
  id: 'plain',
  label: 'Plain HTML',
  description: 'Unstyled semantic HTML: fieldset, label, native select, details. Browser defaults only.',
  Stack: ({ children }) => <div>{children}</div>,
  Group: ({ title, required, info, error, children }) => (
    <fieldset>
      <legend>
        {title}
        {required ? ' (required)' : ''} {info}
      </legend>
      {children}
      {error}
    </fieldset>
  ),
  ChoiceBox: ({ children }) => <blockquote>{children}</blockquote>,
  Field: ({ id, label, required, info, error, children }) => (
    <p>
      <label htmlFor={id}>
        {label}
        {required ? ' (required)' : ''}
      </label>{' '}
      {info}
      <br />
      {children}
      {error}
    </p>
  ),
  Row: ({ children }) => <span>{children}</span>,
  Text: ({ field, type = 'text', maxLength, placeholder, inputMode, ariaLabel, multiline }) =>
    multiline ? (
      <textarea {...field} rows={2} placeholder={placeholder} aria-label={ariaLabel} />
    ) : (
      <input {...field} type={type} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} aria-label={ariaLabel} />
    ),
  Select: ({ id, value, options, onChange, onBlur, invalid, required, describedBy }) => {
    const selected = options.find((o) => o.value === value);
    const hintId = `${id}-opt`;
    return (
      <>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-describedby={[describedBy, selected?.description ? hintId : ''].filter(Boolean).join(' ') || undefined}
        >
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.description ? paras(o.description).join(' ') : undefined}>
              {o.label}
            </option>
          ))}
        </select>
        {selected?.description ? (
          <small id={hintId}>
            <br />
            {paras(selected.description).join(' ')}
          </small>
        ) : null}
      </>
    );
  },
  Button: ({ children, onClick, disabled, ariaLabel }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Hint: ({ id, children }) => (
    <small id={id}>
      <br />
      {children}
    </small>
  ),
  Error: ({ id, children }) => (
    <strong id={id} role="alert">
      <br />
      Error: {children}
    </strong>
  ),
  Toggle: ({ id, checked, onChange, label, info }) => (
    <p>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}> Include {label} (optional)</label> {info}
    </p>
  ),
  ListHeader: ({ title, info, caption, action }) => (
    <p>
      <b>{title}</b> ({caption}) {info} {action}
    </p>
  ),
  ListItem: ({ removeLabel, onRemove, children }) => (
    <div>
      {children}
      <button type="button" aria-label={removeLabel} onClick={onRemove}>
        Remove
      </button>
      <hr />
    </div>
  ),
  Info: ({ text, label }) =>
    text ? (
      <details style={{ display: 'inline' }}>
        <summary aria-label={`About ${label}`} style={{ display: 'inline', cursor: 'pointer' }}>
          ?
        </summary>
        {paras(text).map((p, i) => (
          <small key={i}>
            <br />
            {p}
          </small>
        ))}
      </details>
    ) : null,
};
